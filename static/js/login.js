
document.addEventListener("DOMContentLoaded", () => {
    initPasswordToggler();
    
    disableBrowserZooming();
    
    initInputFocusListeners();
});

function initPasswordToggler() {
    const toggleBtn = document.getElementById("btn-toggle-password");
    const passwordInput = document.getElementById("password");
    const eyeIcon = document.getElementById("password-eye-icon");
    
    if (toggleBtn && passwordInput && eyeIcon) {
        toggleBtn.addEventListener("click", () => {
            const isPassword = passwordInput.getAttribute("type") === "password";
            
            if (isPassword) {
                // Show Password
                passwordInput.setAttribute("type", "text");
                eyeIcon.className = "fa-regular fa-eye-slash";
                toggleBtn.setAttribute("title", "Sembunyikan Password");
            } else {
                // Hide Password
                passwordInput.setAttribute("type", "password");
                eyeIcon.className = "fa-regular fa-eye";
                toggleBtn.setAttribute("title", "Tampilkan Password");
            }
        });
    }
}


window.handleLoginSubmit = function(event) {
    event.preventDefault();
    
    const usernameInput = document.getElementById("username");
    const passwordInput = document.getElementById("password");
    const btnSubmit = document.getElementById("btn-login-submit");
    const cardNode = document.getElementById("login-card-node");
    
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    
    let hasValidationError = false;
    

    if (username === "") {
        usernameInput.classList.add("input-error");
        hasValidationError = true;
    }
    

    if (password === "") {
        passwordInput.classList.add("input-error");
        hasValidationError = true;
    }
    
    if (hasValidationError) {
        showToast("Username atau Password tidak boleh kosong!", "warning");
        triggerCardShake(cardNode);
        return;
    }
    
    usernameInput.setAttribute("disabled", "true");
    passwordInput.setAttribute("disabled", "true");
    btnSubmit.setAttribute("disabled", "true");
    
    btnSubmit.querySelector(".btn-text").classList.add("hidden");
    btnSubmit.querySelector(".btn-loader").classList.remove("hidden");
    

    fetch("http://127.0.0.1:5000/api/login", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ username: username, password: password })
    })
    .then(response => {
        // Jika status HTTP tidak 200 OK (terjadi kegagalan otentikasi)
        if (!response.ok) {
            return response.json().then(err => { throw err; });
        }
        return response.json();
    })
.then(result => {
        // LOGIN BERHASIL: Tampilkan notifikasi toast sukses
        showToast(`Login berhasil! Selamat bekerja, ${result.user.nama}.`, "success");
        
        // Handle remember me state mockup dengan AMAN
        const rememberMeElement = document.getElementById("remember-me");
        if (rememberMeElement) {
            if (rememberMeElement.checked) {
                localStorage.setItem("rememberedStaffUser", result.user.username);
            } else {
                localStorage.removeItem("rememberedStaffUser");
            }
        }
        
        // Simpan data sesi kasir/manager yang aktif ke LocalStorage
        localStorage.setItem("activeUser", JSON.stringify(result.user));
        localStorage.setItem("activeRole", result.role);
        
        setTimeout(() => {
            if (result.role === "manager") {
                window.location.href = "manager.html";
            } else {
                window.location.href = "kasir.html";
            }
        }, 800);
    })
    .catch(err => {
        // LOGIN GAGAL: Bersihkan password, kembalikan input aktif
        usernameInput.removeAttribute("disabled");
        passwordInput.removeAttribute("disabled");
        btnSubmit.removeAttribute("disabled");
        
        btnSubmit.querySelector(".btn-text").classList.remove("hidden");
        btnSubmit.querySelector(".btn-loader").classList.add("hidden");
        
        passwordInput.value = ""; // Bersihkan kolom sandi
        
        usernameInput.classList.add("input-error");
        passwordInput.classList.add("input-error");
        
        const errorMsg = err.message || "Gagal menghubungkan ke server Python (Koneksi Ditolak). Pastikan app.py Anda aktif!";
        showToast(errorMsg, "danger");
        triggerCardShake(cardNode);
        passwordInput.focus();
    });
};


function triggerCardShake(card) {
    if (card) {
        card.classList.add("shake-animation");
        setTimeout(() => {
            card.classList.remove("shake-animation");
        }, 400);
    }
}

function initInputFocusListeners() {
    const usernameInput = document.getElementById("username");
    const passwordInput = document.getElementById("password");
    
    if (usernameInput) {
        usernameInput.addEventListener("input", () => {
            usernameInput.classList.remove("input-error");
        });
    }
    
    if (passwordInput) {
        passwordInput.addEventListener("input", () => {
            passwordInput.classList.remove("input-error");
        });
    }
}


function disableBrowserZooming() {
    document.addEventListener('keydown', function(e) {
        if (e.ctrlKey && (
            e.key === '=' || 
            e.key === '-' || 
            e.key === '+' || 
            e.key === '0' || 
            e.keyCode === 187 || 
            e.keyCode === 189 || 
            e.keyCode === 48 || 
            e.keyCode === 96 || 
            e.keyCode === 107 || 
            e.keyCode === 109
        )) {
            e.preventDefault();
        }
    });

    document.addEventListener('wheel', function(e) {
        if (e.ctrlKey) {
            e.preventDefault();
        }
    }, { passive: false });
}

// Custom Toast Alerts
function showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;
    
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    
    let iconClass = "fa-circle-info";
    if (type === "success") iconClass = "fa-circle-check";
    if (type === "warning") iconClass = "fa-triangle-exclamation";
    if (type === "danger") iconClass = "fa-circle-xmark";
    
    toast.innerHTML = `
        <i class="fa-solid ${iconClass}"></i>
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}
