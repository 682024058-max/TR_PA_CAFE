// manager.js - Core initialization, global state and shared helpers for Manager Dashboard

const API_BASE = '/api';

let SESSION = { id: null, nama: 'Manager', role: 'manager' };

let MENU_ITEMS   = [];
let CATEGORIES   = [];
let CASHIERS     = [];
let TRANSACTIONS = [];
let ATTENDANCES  = [];
let PAYROLL      = [];

let revenueChart = null;
let weeklyChart  = null;

let _currentSlipData = null;

function headerApi() {
    return {
        'Content-Type': 'application/json',
        'X-User-Role' : 'manager',
        'X-User-Id'   : SESSION.id,
        'X-User-Name' : SESSION.nama
    };
}

async function ambilDataApi(url, opts = {}) {
    const res  = await fetch(url, { headers: headerApi(), ...opts });
    const data = await res.json();
    if (data.status === 'error') throw new Error(data.message || 'Terjadi kesalahan pada server.');
    return data;
}

document.addEventListener("DOMContentLoaded", () => {
    muatSesi();
    inisialisasiJamRealtime();
    inisialisasiSalamProfil();
    inisialisasiRouterNavigasi();
    inisialisasiCRUDMenu();
    inisialisasiCRUDKategori();
    inisialisasiCRUDKasir();
    inisialisasiPengendaliAbsensi();
    inisialisasiPengendaliLaporan();
    inisialisasiPengendaliPenggajian();

    muatDataDashboard();
    inisialisasiGrafik();
});

function muatSesi() {
    try {
        const raw = localStorage.getItem('activeUser');
        if (raw) {
            const u    = JSON.parse(raw);
            SESSION.id   = u.id   || null;
            SESSION.nama = u.nama || 'Manager';
        }
    } catch(e) { console.error('Session load error:', e); }
}

function inisialisasiJamRealtime() {
    const el = document.getElementById("live-time");
    if (!el) return;
    const days   = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];
    const months = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
    function tick() {
        const now = new Date();
        el.textContent = `${days[now.getDay()]}, ${String(now.getDate()).padStart(2,'0')} ${months[now.getMonth()]} ${now.getFullYear()} | ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
    }
    tick(); setInterval(tick, 1000);
}

function inisialisasiSalamProfil() {
    const u = JSON.parse(localStorage.getItem("activeUser"));
    if (!u) return;
    const nameEl = document.getElementById("active-manager-name");
    const msgEl  = document.getElementById("welcome-msg");
    if (nameEl) nameEl.textContent = u.nama;
    if (msgEl)  msgEl.textContent  = `Selamat Datang, Manager ${u.nama.split(" ")[0]}! 👋`;
}

function inisialisasiRouterNavigasi() {
    const navItems  = document.querySelectorAll(".nav-item");
    const views     = document.querySelectorAll(".app-view");
    const pageTitle = document.getElementById("page-title");
    const logoutBtn = document.getElementById("btn-logout-sidebar");

    navItems.forEach(item => {
        item.addEventListener("click", () => {
            const target = item.getAttribute("data-target");
            navItems.forEach(i => i.classList.remove("active"));
            item.classList.add("active");
            views.forEach(v => {
                v.classList.remove("active");
                if (v.id === `view-${target}`) v.classList.add("active");
            });
            if (pageTitle) pageTitle.textContent = item.querySelector("span").textContent;

            if      (target === "dashboard")           muatDataDashboard();
            else if (target === "kelola-menu")         { muatKategori().then(() => muatDaftarMenu()); pindahTabDalam('daftar-menu'); }
            else if (target === "kelola-kasir")        muatDaftarKasir();
            else if (target === "monitoring-absensi")  muatAbsensi();
            else if (target === "penggajian")          { muatPenggajian().then(() => { tampilkanTabelPenggajian(); perbaruiMetrikPenggajian(); }); }
            else if (target === "laporan-penjualan")   muatTransaksi();
        });
    });

    document.getElementById("view-all-tx-btn")?.addEventListener("click", () => {
        document.querySelector('[data-target="laporan-penjualan"]')?.click();
    });

    if (logoutBtn) logoutBtn.addEventListener("click", () => bukaModal("logout-confirm-modal"));

    document.getElementById("btn-confirm-logout")?.addEventListener("click", () => {
        localStorage.removeItem("activeUser");
        localStorage.removeItem("activeRole");
        window.location.href = "login.html";
    });
}

// Global UI and Helpers Shared Across Modules
function formatRupiah(amount) {
    return new Intl.NumberFormat("id-ID", {
        style: "currency", currency: "IDR", minimumFractionDigits: 0
    }).format(amount).replace("IDR", "Rp");
}

window.bukaModal  = function(id) { document.getElementById(id)?.classList.add("active"); }
window.tutupModal = function(id) { document.getElementById(id)?.classList.remove("active"); }

function tampilkanToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;
    const icons = { success:"fa-circle-check", warning:"fa-triangle-exclamation", danger:"fa-circle-xmark", error:"fa-circle-xmark", info:"fa-circle-info" };
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

function eksporKeExcel(filename, headers, rows) {
    let csvContent = "sep=,\n"; 
    csvContent += headers.join(",") + "\n";
    rows.forEach(row => {
        const escapedRow = row.map(val => {
            let str = String(val === null || val === undefined ? "" : val);
            str = str.replace(/"/g, '""');
            if (str.includes(",") || str.includes("\n") || str.includes('"')) {
                str = `"${str}"`;
            }
            return str;
        });
        csvContent += escapedRow.join(",") + "\n";
    });
    
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function cetakLaporanHTML(title, headers, rows) {
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
        tampilkanToast("Pop-up blocker aktif! Mohon izinkan pop-up untuk mencetak PDF.", "warning");
        return;
    }
    
    let tableHeaders = headers.map(h => `<th>${h}</th>`).join('');
    let tableRows = rows.map(row => {
        return `<tr>${row.map(val => `<td>${val}</td>`).join('')}</tr>`;
    }).join('');
    
    const issuedDate = new Date().toLocaleDateString("id-ID", { day:"numeric", month:"long", year:"numeric", hour:"2-digit", minute:"2-digit" });
    
    printWindow.document.write(`
        <html>
        <head>
            <title>${title}</title>
            <style>
                body {
                    font-family: 'Inter', 'Segoe UI', Helvetica, Arial, sans-serif;
                    color: #333;
                    padding: 40px;
                    line-height: 1.5;
                }
                .header {
                    text-align: center;
                    margin-bottom: 30px;
                }
                .header h1 {
                    margin: 0;
                    color: #4e3629;
                    font-size: 24px;
                    font-weight: 700;
                }
                .header p {
                    margin: 5px 0 0 0;
                    color: #666;
                    font-size: 14px;
                }
                .meta {
                    margin-bottom: 20px;
                    font-size: 13px;
                    color: #555;
                    display: flex;
                    justify-content: space-between;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 30px;
                    font-size: 13px;
                }
                th, td {
                    border: 1px solid #ddd;
                    padding: 10px 12px;
                    text-align: left;
                }
                th {
                    background-color: #f8f6f2;
                    color: #4e3629;
                    font-weight: 600;
                }
                tr:nth-child(even) {
                    background-color: #faf9f6;
                }
                .footer {
                    margin-top: 50px;
                    display: flex;
                    justify-content: space-between;
                    font-size: 13px;
                }
                .signature-box {
                    text-align: center;
                    width: 200px;
                }
                .signature-space {
                    height: 70px;
                }
                @media print {
                    body { padding: 0; }
                    button { display: none; }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>KOPI SIBEI CAFE</h1>
                <p>${title}</p>
            </div>
            <div class="meta">
                <span>Diterbitkan oleh: Store Manager</span>
                <span>Waktu Cetak: ${issuedDate}</span>
            </div>
            <table>
                <thead>
                    <tr>${tableHeaders}</tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
            <div class="footer">
                <div>
                    <p>Dicetak otomatis oleh POS System.</p>
                </div>
                <div class="signature-box">
                    <p>Mengetahui,</p>
                    <div class="signature-space"></div>
                    <p><strong>Store Manager</strong></p>
                </div>
            </div>
            <script>
                window.onload = function() {
                    window.print();
                    setTimeout(function() { window.close(); }, 500);
                };
            </script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

window.pilihGambarTemplat  = function() {};
window.perbaruiPratinjauGambarMenu = function() {};

window.openModal = window.bukaModal;
window.closeModal = window.tutupModal;
window.showToast = window.tampilkanToast;
window.formatIDR = window.formatRupiah;
