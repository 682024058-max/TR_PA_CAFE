// kasir-pembayaran.js - Kelola Pembayaran & Checkout Kasir

function initPaymentInteractions() {
    const checkoutBtn = document.getElementById('btn-pay-checkout');
    const cashInput   = document.getElementById('cash-tendered');
    const methodCards = document.querySelectorAll('.method-card');

    checkoutBtn?.addEventListener('click', () => {
        if (!cart.length) return;
        const sub   = cart.reduce((s, i) => s + i.price * i.qty, 0);
        const tax   = 0;
        const svc   = 0;
        const total = sub;

        document.getElementById('payment-grand-total').innerText = formatRupiah(total);
        document.getElementById('payment-grand-total').setAttribute('data-amount', total);
        cashInput.value = '';
        document.getElementById('payment-change').innerText = 'Rp0';
        document.getElementById('insufficient-funds-alert').classList.add('hidden');
        
        qrisFotoBase64 = null;
        document.getElementById('qris-proof-section').classList.add('hidden');
        const qrisPreviewImg = document.getElementById('qris-preview-img');
        if (qrisPreviewImg) {
            qrisPreviewImg.src = '';
            qrisPreviewImg.classList.add('hidden');
        }
        document.getElementById('qris-preview-placeholder')?.classList.remove('hidden');

        document.querySelector('input[name="payment_method"][value="Cash"]').checked = true;
        methodCards.forEach(c => c.classList.remove('active'));
        document.querySelector('.method-card[data-method="Cash"]').classList.add('active');
        document.getElementById('cash-calculator-section').classList.remove('hidden');
        document.getElementById('change-display-box').classList.remove('hidden');
        bukaModal('payment-modal');
        setTimeout(() => cashInput.focus(), 200);
    });

    document.querySelectorAll('.btn-quick-cash').forEach(btn => {
        btn.addEventListener('click', () => {
            const total = parseInt(document.getElementById('payment-grand-total').getAttribute('data-amount'));
            cashInput.value = btn.getAttribute('data-amount') === 'exact'
                ? total : parseInt(btn.getAttribute('data-amount'));
            hitungKembalian(total);
        });
    });

    cashInput?.addEventListener('input', () =>
        hitungKembalian(parseInt(document.getElementById('payment-grand-total').getAttribute('data-amount'))));

    methodCards.forEach(card => {
        card.addEventListener('click', () => {
            methodCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            card.querySelector('input[type="radio"]').checked = true;
            const isNonCash = card.querySelector('input').value !== 'Cash';
            const isQRIS = card.querySelector('input').value === 'QRIS';
            
            document.getElementById('cash-calculator-section').classList.toggle('hidden', isNonCash);
            document.getElementById('change-display-box').classList.toggle('hidden', isNonCash);
            document.getElementById('qris-proof-section').classList.toggle('hidden', !isQRIS);
            document.getElementById('insufficient-funds-alert').classList.add('hidden');
            
            if (!isNonCash)
                hitungKembalian(parseInt(document.getElementById('payment-grand-total').getAttribute('data-amount')));
        });
    });

    const btnTakeQrisPhoto = document.getElementById('btn-take-qris-photo');

    btnTakeQrisPhoto?.addEventListener('click', async () => {
        bukaModal('camera-modal');
        const titleEl = document.getElementById('camera-modal-title');
        if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-camera"></i> Ambil Foto Bukti Transfer';

        currentFacingMode = 'environment';
        const flipBtn = document.getElementById('btn-flip-camera');
        if (flipBtn) flipBtn.innerHTML = '<i class="fa-solid fa-rotate"></i> Kamera Depan';

        await mulaiKamera();

        const btnCapture = document.getElementById('btn-capture-absensi');
        const newBtn = btnCapture.cloneNode(true);
        btnCapture.parentNode.replaceChild(newBtn, btnCapture);

        newBtn.addEventListener('click', () => {
            const foto = ambilFotoKamera();
            if (!foto) { tampilkanToast('Gagal mengambil foto', 'danger'); return; }
            hentikanKamera();
            tutupModal('camera-modal');

            qrisFotoBase64 = foto;
            const previewImg = document.getElementById('qris-preview-img');
            const previewPlaceholder = document.getElementById('qris-preview-placeholder');
            if (previewImg && previewPlaceholder) {
                previewImg.src = foto;
                previewImg.classList.remove('hidden');
                previewPlaceholder.classList.add('hidden');
            }
        });
    });

    document.getElementById('btn-process-payment')?.addEventListener('click', prosesCheckoutAktif);
}

function hitungKembalian(grandTotal) {
    const cash = parseInt(document.getElementById('cash-tendered').value) || 0;
    const chg  = cash - grandTotal;
    document.getElementById('payment-change').innerText = chg >= 0 ? formatRupiah(chg) : 'Rp0';
    document.getElementById('insufficient-funds-alert')
        .classList.toggle('hidden', cash === 0 || chg >= 0);
}

async function prosesCheckoutAktif() {
    const grandTotal = parseInt(document.getElementById('payment-grand-total').getAttribute('data-amount'));
    const method     = document.querySelector('input[name="payment_method"]:checked').value;
    const cashInput  = document.getElementById('cash-tendered');
    let cashPaid = grandTotal, change = 0;

    if (method === 'Cash') {
        cashPaid = parseInt(cashInput.value) || 0;
        if (cashPaid < grandTotal) {
            tampilkanToast('Uang tunai tidak cukup!', 'danger');
            document.getElementById('insufficient-funds-alert').classList.remove('hidden');
            document.querySelector('.payment-modal-content').classList.add('modal-shake');
            setTimeout(() =>
                document.querySelector('.payment-modal-content').classList.remove('modal-shake'), 500);
            return;
        }
        change = cashPaid - grandTotal;
    } else if (method === 'QRIS') {
        if (!qrisFotoBase64) {
            tampilkanToast('Bukti transfer QRIS wajib diambil!', 'danger');
            document.querySelector('.payment-modal-content').classList.add('modal-shake');
            setTimeout(() =>
                document.querySelector('.payment-modal-content').classList.remove('modal-shake'), 500);
            return;
        }
    }

    const sub = cart.reduce((s, i) => s + i.price * i.qty, 0);
    const tax = 0;
    const svc = 0;

    const payload = {
        id_user           : SESSION.id,
        total_harga       : grandTotal,
        uang_bayar        : cashPaid,
        kembalian         : change,
        metode_pembayaran : method,
        items: cart.map(i => ({
            id_product: i.id,
            qty       : i.qty,
            subtotal  : i.price * i.qty
        }))
    };

    if (method === 'QRIS' && qrisFotoBase64) {
        payload.foto_bukti_tf = qrisFotoBase64;
    }

    const btnProcess = document.getElementById('btn-process-payment');
    btnProcess.setAttribute('disabled','true');
    btnProcess.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...';

    try {
        const res  = await fetch(`${API_BASE}/transaksi`, {
            method:'POST', headers: headerApi(), body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (data.status === 'success') {
            const txForReceipt = {
                id: data.id_transaksi,
                txId: `TX-${String(data.id_transaksi).padStart(6,'0')}`,
                date: ambilFormatTanggalWaktu(new Date()),
                cashier: SESSION.nama,
                items: [...cart],
                subtotal: sub, tax: 0, service: 0,
                grandTotal, method, cashPaid, change
            };
            tutupModal('payment-modal');
            aturUlangStatusKeranjang();
            tampilkanToast('Transaksi Berhasil Diproses!', 'success');
            await loadTransaksiHariIni();
            setTimeout(() => simulasikanCetakStruk(txForReceipt), 400);
        } else {
            tampilkanToast(data.message || 'Gagal menyimpan transaksi!', 'danger');
        }
    } catch (e) {
        console.error(e);
        tampilkanToast('Gagal terhubung ke server!', 'danger');
    } finally {
        btnProcess.removeAttribute('disabled');
        btnProcess.innerHTML = '<i class="fa-solid fa-square-check"></i> Proses Pembayaran';
    }
}

function simulasikanCetakStruk(tx, isReprint = false) {
    document.getElementById('print-loading-overlay')?.classList.add('hidden');
    bukaModal('receipt-modal');
    
    const closeBtnX = document.getElementById('btn-close-receipt-x');
    const closeBtnFooter = document.getElementById('btn-close-receipt-footer');
    if (isReprint) {
        closeBtnX?.classList.remove('hidden');
        closeBtnFooter?.classList.remove('hidden');
    } else {
        closeBtnX?.classList.add('hidden');
        closeBtnFooter?.classList.add('hidden');
    }

    document.getElementById('receipt-tx-id').innerText       = tx.txId || `#${tx.id}`;
    document.getElementById('receipt-date').innerText        = tx.date;
    document.getElementById('receipt-cashier').innerText     = tx.cashier;
    document.getElementById('receipt-subtotal').innerText    = formatRupiah(tx.subtotal);
    document.getElementById('receipt-tax').innerText         = formatRupiah(tx.tax);
    document.getElementById('receipt-service').innerText     = formatRupiah(tx.service);
    document.getElementById('receipt-grand-total').innerText = formatRupiah(tx.grandTotal);
    document.getElementById('receipt-method').innerText      = tx.method;
    document.getElementById('receipt-cash-paid').innerText   = formatRupiah(tx.cashPaid);
    document.getElementById('receipt-change').innerText      = formatRupiah(tx.change);

    const tbody = document.getElementById('receipt-items-tbody');
    if (tbody) {
        tbody.innerHTML = '';
        tx.items.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td align="left">${item.name}
                    <br><small style="color:#666">@${formatRupiah(item.price)}</small></td>
                <td align="center">${item.qty}</td>
                <td align="right">${formatRupiah(item.price * item.qty)}</td>`;
            tbody.appendChild(tr);
        });
    }

    const printBtn = document.getElementById('btn-print-receipt');
    if (printBtn) {
        const newBtn = printBtn.cloneNode(true);
        printBtn.parentNode.replaceChild(newBtn, printBtn);
        newBtn.addEventListener('click', () => {
            window.print();
            if (!isReprint) {
                tutupModal('receipt-modal');
            }
        });
    }
}
