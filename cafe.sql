CREATE DATABASE cafe;
use cafe;

-- 1. Tabel users (Kasir & Manager)
CREATE TABLE users (
    id_user INT AUTO_INCREMENT PRIMARY KEY,
    nama VARCHAR(100) NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,         
    email VARCHAR(100) UNIQUE NOT NULL,
    role ENUM('manager', 'kasir') NOT NULL,
    status ENUM('aktif', 'nonaktif') DEFAULT 'aktif',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Tabel kategori produk
CREATE TABLE kategori (
    id_kategori INT AUTO_INCREMENT PRIMARY KEY,
    nama_kategori VARCHAR(50) NOT NULL,
    icon VARCHAR(50) NOT NULL DEFAULT 'fa-tag' 
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Tabel produk (Menu)
CREATE TABLE products (
    id_products INT AUTO_INCREMENT PRIMARY KEY,
    nama_produk VARCHAR(150) NOT NULL,
    kategori VARCHAR(50) NOT NULL,            
    icon VARCHAR(50) NOT NULL DEFAULT 'fa-mug-hot',
    warna VARCHAR(10) NOT NULL DEFAULT '#4e3629',
    dibuat_ TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    update_ TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Tabel transaksi utama
CREATE TABLE transaksi (
    id_transaksi INT AUTO_INCREMENT PRIMARY KEY,
    id_user INT NOT NULL,                      
    tanggal_transaksi DATETIME DEFAULT CURRENT_TIMESTAMP,
    total_harga INT NOT NULL,
    metode_pembayaran ENUM('Cash', 'QRIS', 'Debit') NOT NULL,
    uang_bayar INT NOT NULL,
    kembalian INT NOT NULL,
    status_transaksi ENUM('selesai', 'batal') DEFAULT 'selesai',
    FOREIGN KEY (id_user) REFERENCES users(id_user)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Tabel detail item transaksi
CREATE TABLE detail_transaksi (
    id_detail INT AUTO_INCREMENT PRIMARY KEY,
    id_transaksi INT NOT NULL,
    id_products INT NOT NULL,
    qty INT NOT NULL,
    subtotal INT NOT NULL,
    FOREIGN KEY (id_transaksi) REFERENCES transaksi(id_transaksi) ON DELETE CASCADE,
    FOREIGN KEY (id_products) REFERENCES products(id_products)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. Tabel absensi harian kasir
CREATE TABLE absensi (
    id_absensi INT AUTO_INCREMENT PRIMARY KEY,
    date DATE NOT NULL,
    nama_kasir VARCHAR(100) NOT NULL,         
    jam_masuk TIME NOT NULL,
    jam_keluar TIME DEFAULT NULL,
    total_jam DECIMAL(4,2) DEFAULT NULL,      
    status VARCHAR(50) DEFAULT 'Hadir',        
    waktu_dibuat TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. Tabel penggajian bulanan kasir
CREATE TABLE penggajian (
    id_penggajian INT AUTO_INCREMENT PRIMARY KEY,
    id_kasir INT NOT NULL,                      
    periode VARCHAR(7) NOT NULL,                
    rate_per_shift INT NOT NULL DEFAULT 75000,
    total_shift INT NOT NULL DEFAULT 0,         
    total_gaji INT NOT NULL,                    
    bukti_tf LONGTEXT DEFAULT NULL,             
    tanggal_dibuat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_kasir) REFERENCES users(id_user) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO kategori (id_kategori, nama_kategori, icon) VALUES 
(1, 'Coffee', 'fa-mug-hot'),
(2, 'Non-Coffee', 'fa-glass-water'),
(3, 'Snack', 'fa-cookie'),
(4, 'Dessert', 'fa-cake-candles');

INSERT INTO users (nama, username, password, email, role, status) 
VALUES ('Yohana Manager', 'manager1', 'manager123', 'kepineliano@gmail.com', 'manager', 'aktif');