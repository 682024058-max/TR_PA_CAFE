// kasir-absensi.js - Log & Aksi Absensi Kasir

async function muatAbsensiHariIni() {
    if (!SESSION.nama) return;
    const today = new Date().toISOString().slice(0, 10);
    try {
        const res  = await fetch(`${API_BASE}/absensi?tanggal=${today}`, { headers: headerApi() });
        const data = await res.json();
        if (data.status === 'success' && data.data.length > 0) {
            const abs = data.data[0];
            currentAttendance.id_absensi = abs.id_absensi;
            currentAttendance.clockIn    = (abs.jam_masuk  || '').slice(0, 8);
            currentAttendance.clockOut   = (abs.jam_keluar || '').slice(0, 8);
            currentAttendance.activeDate = today;
            currentAttendance.status     = abs.jam_keluar ? 'Selesai Shift' : 'Aktif Bekerja';
            perbaruiUIAbsensi();
        }
    } catch (e) { console.error('Gagal load absensi hari ini:', e); }
}

async function loadRiwayatAbsensi() {
    if (!SESSION.nama) return;
    try {
        const res  = await fetch(`${API_BASE}/absensi`, { headers: headerApi() });
        const data = await res.json();
        if (data.status === 'success') { attendanceLogs = data.data; tampilkanLogAbsensi(); }
    } catch (e) { console.error('Gagal load riwayat absensi:', e); }
}

let webcamStream = null;
let currentFacingMode = 'environment';

async function mulaiKamera() {
    const video = document.getElementById('webcam-video');
    const loading = document.getElementById('camera-loading-placeholder');
    const errorEl = document.getElementById('camera-error-placeholder');

    if (!video) return;

    if (loading) loading.style.display = 'flex';
    if (errorEl) errorEl.style.display = 'none';

    video.style.transform = currentFacingMode === 'user' ? 'scaleX(-1)' : 'scaleX(1)';

    try {
        webcamStream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480, facingMode: currentFacingMode },
            audio: false
        });
        video.srcObject = webcamStream;
        if (loading) loading.style.display = 'none';
    } catch (err) {
        console.error('Error accessing webcam:', err);
        if (loading) loading.style.display = 'none';
        if (errorEl) errorEl.style.display = 'flex';
    }
}

function hentikanKamera() {
    if (webcamStream) {
        webcamStream.getTracks().forEach(track => track.stop());
        webcamStream = null;
    }
    const video = document.getElementById('webcam-video');
    if (video) video.srcObject = null;
}

async function flipKamera() {
    hentikanKamera();
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    const btn = document.getElementById('btn-flip-camera');
    if (btn) btn.innerHTML = currentFacingMode === 'user'
        ? '<i class="fa-solid fa-rotate"></i> Kamera Belakang'
        : '<i class="fa-solid fa-rotate"></i> Kamera Depan';
    await mulaiKamera();
}
window.flipKamera = flipKamera;

function ambilFotoKamera() {
    const video = document.getElementById('webcam-video');
    const canvas = document.getElementById('webcam-canvas');
    if (!video || !canvas || !webcamStream) return null;
    
    const context = canvas.getContext('2d');
    canvas.width = 640;
    canvas.height = 480;
    
    context.drawImage(video, 0, 0, 640, 480);
    
    context.font = "bold 18px Arial, sans-serif";
    context.fillStyle = "rgba(255, 255, 255, 0.95)";
    context.strokeStyle = "rgba(0, 0, 0, 0.8)";
    context.lineWidth = 4;
    
    const timestamp = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    const text1 = `KOPI SIBEI - ${timestamp}`;
    
    context.strokeText(text1, 20, 450);
    context.fillText(text1, 20, 450);
    
    return canvas.toDataURL('image/jpeg', 0.85);
}

window.closeCameraModal = function() {
    hentikanKamera();
    tutupModal('camera-modal');
};

function initAttendanceInteractions() {
    document.getElementById('btn-clock-in')?.addEventListener('click', async () => {
        if (currentAttendance.status !== 'Belum Absen') return;
        if (!SESSION.nama) { tampilkanToast('Session tidak ditemukan, login ulang','danger'); return; }

        bukaModal('camera-modal');
        const titleEl = document.getElementById('camera-modal-title');
        if (titleEl) {
            titleEl.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Foto Absen Masuk';
        }
        
        await mulaiKamera();

        const captureBtn = document.getElementById('btn-capture-absensi');
        if (captureBtn) {
            const newCaptureBtn = captureBtn.cloneNode(true);
            captureBtn.parentNode.replaceChild(newCaptureBtn, captureBtn);

            newCaptureBtn.addEventListener('click', async () => {
                newCaptureBtn.setAttribute('disabled', 'true');
                newCaptureBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Mengirim...';

                const photo = ambilFotoKamera();
                if (!photo) {
                    tampilkanToast('Foto absensi gagal diambil! Pastikan izin kamera aktif.', 'danger');
                    newCaptureBtn.removeAttribute('disabled');
                    newCaptureBtn.innerHTML = '<i class="fa-solid fa-check-circle"></i> Jepret & Kirim';
                    return;
                }

                try {
                    const res  = await fetch(`${API_BASE}/absensi/masuk`, {
                        method : 'POST',
                        headers: headerApi(),
                        body   : JSON.stringify({ 
                            nama_kasir: SESSION.nama,
                            foto: photo 
                        })
                    });
                    const data = await res.json();
                    if (data.status === 'success') {
                        currentAttendance.status     = 'Aktif Bekerja';
                        currentAttendance.clockIn    = new Date().toLocaleTimeString('id-ID');
                        currentAttendance.activeDate = new Date().toISOString().slice(0, 10);
                        currentAttendance.id_absensi = data.id_absensi;
                        perbaruiUIAbsensi();
                        tampilkanToast('Absen Masuk berhasil dicatat!','success');
                        hentikanKamera();
                        tutupModal('camera-modal');
                        loadRiwayatAbsensi();
                    } else {
                        tampilkanToast(data.message || 'Gagal absen masuk','danger');
                    }
                } catch (e) { 
                    console.error(e);
                    tampilkanToast('Gagal terhubung ke server!','danger'); 
                } finally {
                    newCaptureBtn.removeAttribute('disabled');
                    newCaptureBtn.innerHTML = '<i class="fa-solid fa-check-circle"></i> Jepret & Kirim';
                }
            });
        }
    });

    document.getElementById('btn-clock-out')?.addEventListener('click', async () => {
        if (currentAttendance.status !== 'Aktif Bekerja') return;
        if (!sudahBekerjaDelapanJam()) {
            tampilkanToast('Anda belum mencapai 8 jam kerja!', 'warning');
            return;
        }

        bukaModal('camera-modal');
        const titleEl = document.getElementById('camera-modal-title');
        if (titleEl) {
            titleEl.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i> Foto Absen Pulang';
        }
        
        await mulaiKamera();

        const captureBtn = document.getElementById('btn-capture-absensi');
        if (captureBtn) {
            const newCaptureBtn = captureBtn.cloneNode(true);
            captureBtn.parentNode.replaceChild(newCaptureBtn, captureBtn);

            newCaptureBtn.addEventListener('click', async () => {
                newCaptureBtn.setAttribute('disabled', 'true');
                newCaptureBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Mengirim...';

                const photo = ambilFotoKamera();
                if (!photo) {
                    tampilkanToast('Foto absensi gagal diambil! Pastikan izin kamera aktif.', 'danger');
                    newCaptureBtn.removeAttribute('disabled');
                    newCaptureBtn.innerHTML = '<i class="fa-solid fa-check-circle"></i> Jepret & Kirim';
                    return;
                }

                try {
                    const res  = await fetch(`${API_BASE}/absensi/keluar`, {
                        method : 'PUT',
                        headers: headerApi(),
                        body   : JSON.stringify({
                            id_absensi: currentAttendance.id_absensi,
                            foto: photo
                        })
                    });
                    const data = await res.json();
                    if (data.status === 'success') {
                        currentAttendance.clockOut = new Date().toLocaleTimeString('id-ID');
                        currentAttendance.status   = 'Selesai Shift';
                        perbaruiUIAbsensi();
                        tampilkanToast('Absen Pulang dicatat. Selamat beristirahat!','success');
                        hentikanKamera();
                        tutupModal('camera-modal');
                        loadRiwayatAbsensi();
                    } else {
                        tampilkanToast(data.message || 'Gagal absen keluar','danger');
                    }
                } catch (e) { 
                    console.error(e);
                    tampilkanToast('Gagal terhubung ke server!','danger'); 
                } finally {
                    newCaptureBtn.removeAttribute('disabled');
                    newCaptureBtn.innerHTML = '<i class="fa-solid fa-check-circle"></i> Jepret & Kirim';
                }
            });
        }
    });
}

function sudahBekerjaDelapanJam() {
    if (!currentAttendance.clockIn) return false;
    const timeParts = currentAttendance.clockIn.replace(/\./g, ':').split(':');
    if (timeParts.length < 2) return false;
    const clockInDate = new Date();
    clockInDate.setHours(parseInt(timeParts[0]), parseInt(timeParts[1]), timeParts[2] ? parseInt(timeParts[2]) : 0, 0);
    let diffHours = (new Date() - clockInDate) / (1000 * 60 * 60);
    if (diffHours < 0) {
        clockInDate.setDate(clockInDate.getDate() - 1);
        diffHours = (new Date() - clockInDate) / (1000 * 60 * 60);
    }
    return diffHours >= 8;
}

function perbaruiUIAbsensi() {
    const btnIn  = document.getElementById('btn-clock-in');
    const btnOut = document.getElementById('btn-clock-out');
    const badge  = document.getElementById('nav-attendance-badge');

    if (currentAttendance.status === 'Aktif Bekerja') {
        btnIn?.setAttribute('disabled','true'); btnIn?.classList.add('disabled');
        btnOut?.removeAttribute('disabled');    btnOut?.classList.remove('disabled');
        if (badge) {
            badge.querySelector('.status-indicator').className = 'status-indicator success';
            badge.querySelector('.status-label').innerText = `Shift Aktif (${currentAttendance.clockIn})`;
        }
        const inEl = document.getElementById('att-summary-in');
        if (inEl) { inEl.innerText = currentAttendance.clockIn; inEl.classList.remove('empty-state-text'); }
        document.getElementById('att-summary-status').innerHTML =
            `<span class="badge badge-success">Aktif Bekerja</span>`;

    } else if (currentAttendance.status === 'Selesai Shift') {
        btnIn?.setAttribute('disabled','true');  btnIn?.classList.add('disabled');
        btnOut?.setAttribute('disabled','true'); btnOut?.classList.add('disabled');
        if (badge) {
            badge.querySelector('.status-indicator').className = 'status-indicator warning';
            badge.querySelector('.status-label').innerText = 'Sesi Shift Selesai';
        }
        const inEl  = document.getElementById('att-summary-in');
        const outEl = document.getElementById('att-summary-out');
        if (inEl)  { inEl.innerText  = currentAttendance.clockIn;  inEl.classList.remove('empty-state-text'); }
        if (outEl) { outEl.innerText = currentAttendance.clockOut; outEl.classList.remove('empty-state-text'); }
        document.getElementById('att-summary-status').innerHTML =
            `<span class="badge badge-success">Pulang</span>`;
    }
}

function tampilkanLogAbsensi() {
    const tbody = document.getElementById('attendance-log-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!attendanceLogs.length) {
        tbody.innerHTML =
            `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px">
                Belum ada data absensi bulan ini.
             </td></tr>`;
        return;
    }

    attendanceLogs.forEach(log => {
        const masuk  = (log.jam_masuk  || '').slice(0, 8) || '--:--';
        const keluar = (log.jam_keluar || '').slice(0, 8) || '--:--';
        const jam    = log.total_jam != null ? `${parseFloat(log.total_jam).toFixed(1)} Jam` : '--';
        const status = log.status || 'Hadir';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${formatTanggal(log.date, true)}</strong></td>
            <td><i class="fa-regular fa-clock text-green"></i> ${masuk}</td>
            <td><i class="fa-regular fa-clock text-gold"></i> ${keluar}</td>
            <td><strong>${jam}</strong></td>
            <td><span class="badge ${status==='Hadir'?'badge-success':'badge-warning'}">
                <i class="fa-solid fa-circle-check"></i> ${status}</span></td>`;
        tbody.appendChild(tr);
    });
}
