// kasir-menu.js - Kelola Keranjang & Pesanan Kasir

function initReceiptModalClose() {
    const btnCloseStruk = document.getElementById('btn-close-struk');
    const receiptModal = document.getElementById('receipt-modal');

    if (btnCloseStruk) {
        btnCloseStruk.addEventListener('click', function() {
            closeModal('receipt-modal');
        });
    }

    if (receiptModal) {
        receiptModal.addEventListener('click', function(e) {
            if (e.target === receiptModal) {
                closeModal('receipt-modal');
            }
        });
    }
}

function initCartInteractions() {
    document.getElementById('btn-reset-cart')?.addEventListener('click', () => {
        if (cart.length > 0) { aturUlangStatusKeranjang(); tampilkanToast('Keranjang dikosongkan', 'success'); }
    });
}

window.tambahItemKeKeranjang = function (itemId) {
    const menu = MENU_ITEMS.find(i => i.id === itemId);
    if (!menu) return;
    const existing = cart.find(i => i.id === itemId);
    if (existing) existing.qty += 1;
    else cart.push({ id: menu.id, name: menu.name, price: menu.price, qty: 1 });
    tampilkanDaftarKeranjang();
    tampilkanToast(`${menu.name} ditambahkan!`, 'success');
};

function tampilkanDaftarKeranjang() {
    const container   = document.getElementById('cart-items-container');
    const checkoutBtn = document.getElementById('btn-pay-checkout');
    if (!container) return;
    container.innerHTML = '';

    if (!cart.length) {
        container.innerHTML =
            `<div class="empty-cart-box">
                <i class="fa-solid fa-mug-saucer"></i>
                <h4>Keranjang Kosong</h4>
                <p>Klik tombol "+" pada menu untuk memesan.</p>
             </div>`;
        checkoutBtn?.classList.add('disabled');
        checkoutBtn?.setAttribute('disabled','true');
        checkoutBtn?.classList.remove('btn-highlight');
        perbaruiTotalKeranjang(0, 0, 0, 0);
        return;
    }

    cart.forEach(item => {
        const row = document.createElement('div');
        row.className = 'cart-item';
        row.innerHTML = `
            <div class="cart-item-details">
                <h4 class="cart-item-name">${item.name}</h4>
                <p class="cart-item-price">${formatRupiah(item.price)}</p>
            </div>
            <div class="cart-item-qty-control">
                <button class="btn-qty" onclick="sesuaikanJumlahKeranjang(${item.id},-1)">
                    <i class="fa-solid fa-minus"></i></button>
                <div class="qty-val">${item.qty}</div>
                <button class="btn-qty" onclick="sesuaikanJumlahKeranjang(${item.id},1)">
                    <i class="fa-solid fa-plus"></i></button>
            </div>
            <div class="cart-item-subtotal">${formatRupiah(item.price * item.qty)}</div>
            <button class="btn-delete-item" onclick="hapusItemKeranjang(${item.id})">
                <i class="fa-regular fa-trash-can"></i></button>`;
        container.appendChild(row);
    });

    checkoutBtn?.classList.remove('disabled');
    checkoutBtn?.removeAttribute('disabled');
    checkoutBtn?.classList.add('btn-highlight');
    hitungStatusKeranjang();
}

window.sesuaikanJumlahKeranjang = function (itemId, change) {
    const target = cart.find(i => i.id === itemId);
    if (!target) return;
    target.qty += change;
    if (target.qty < 1) hapusItemKeranjang(itemId);
    else tampilkanDaftarKeranjang();
};

window.hapusItemKeranjang = function (itemId) {
    const idx = cart.findIndex(i => i.id === itemId);
    if (idx > -1) {
        const name = cart[idx].name;
        cart.splice(idx, 1);
        tampilkanDaftarKeranjang();
        tampilkanToast(`${name} dihapus`, 'warning');
    }
};

function aturUlangStatusKeranjang() { cart = []; tampilkanDaftarKeranjang(); }

function hitungStatusKeranjang() {
    const sub = cart.reduce((s, i) => s + i.price * i.qty, 0);
    const tax = 0;
    const svc = 0;
    perbaruiTotalKeranjang(sub, tax, svc, sub);
}

function perbaruiTotalKeranjang(sub, tax, svc, total) {
    document.getElementById('cart-subtotal').innerText    = formatRupiah(sub);
    document.getElementById('cart-tax').innerText         = formatRupiah(tax);
    document.getElementById('cart-service').innerText     = formatRupiah(svc);
    document.getElementById('cart-grand-total').innerText = formatRupiah(total);
}
