// kasir.js - Core initialization, global state and shared helpers for Cashier POS

const API_BASE = '/api';

let SESSION = { id: null, nama: 'Kasir', role: 'kasir' };

let MENU_ITEMS     = [];
let transactions   = [];
let historyTransactions = [];
let attendanceLogs = [];
let cart           = [];
let activeCategory = 'all';
let searchQuery    = '';
let salesChart     = null;
let qrisFotoBase64 = null;
let currentAttendance = {
    status: 'Belum Absen',   
    clockIn: '', clockOut: '', activeDate: '', id_absensi: null
};

const KATEGORI_LABEL = {
    'coffee'    : '☕ Coffee',
    'non-coffee': '🥤 Non Coffee',
    'snack'     : '🍿 Snack',
    'dessert'   : '🍰 Dessert'
};

function headerApi() {
    return {
        'Content-Type': 'application/json',
        'X-User-Role' : SESSION.role,
        'X-User-Id'   : SESSION.id,
        'X-User-Name' : SESSION.nama   
    };
}

function apiHeaders() {
    return headerApi();
}

document.addEventListener('DOMContentLoaded', () => {
    loadSession();
    initRealtimeClock();
    initNavigationRouter();
    initMobileSidebar();
    initCartInteractions();
    initPaymentInteractions();
    initAttendanceInteractions();
    initHistoryFilters();
    initGeneralModalTriggers();
    initReceiptModalClose();
    disableBrowserZooming();
    initChart();

    loadKategoriDanProduk();
    loadTransaksiHariIni();
    muatAbsensiHariIni();
    loadRiwayatAbsensi();
});

// Shared Helpers
function formatTanggal(dateStr, dateOnly=false, timeOnly=false) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    if (timeOnly) return d.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    if (dateOnly) return d.toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'});
    return d.toLocaleString('id-ID',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
}

function formatRupiah(amount) {
    return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',minimumFractionDigits:0})
        .format(amount).replace(/,00$/,'');
}

function ambilFormatTanggalWaktu(date) {
    const p = n => String(n).padStart(2,'0');
    return `${date.getFullYear()}-${p(date.getMonth()+1)}-${p(date.getDate())} `
         + `${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
}

window.bukaModal  = function(id) { document.getElementById(id)?.classList.add('active'); };
window.tutupModal = function(id) { document.getElementById(id)?.classList.remove('active'); };
window.openModal = window.bukaModal;
window.closeModal = window.tutupModal;

window.tampilkanToast = function(message, type='info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const icons = {success:'fa-circle-check',warning:'fa-triangle-exclamation',
                   danger:'fa-circle-xmark',info:'fa-circle-info'};
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fa-solid ${icons[type]||icons.info}"></i><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
};
window.showToast = window.tampilkanToast;
window.formatIDR = window.formatRupiah;

function initGeneralModalTriggers() {
    document.getElementById('btn-logout-sidebar')?.addEventListener('click', () => bukaModal('logout-modal'));
    document.getElementById('btn-confirm-logout')?.addEventListener('click', () => {
        tutupModal('logout-modal');
        localStorage.removeItem('activeUser');
        localStorage.removeItem('activeRole');
        tampilkanToast('Sesi ditutup. Sampai jumpa!','warning');
        setTimeout(() => window.location.href = 'login.html', 800);
    });
}