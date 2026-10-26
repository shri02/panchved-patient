/**
 * Ocayur Patient Portal - Complete Single-Page Application Engine
 * Supports:
 * - View 1: Login
 * - View 2: Personal Details (Step 1/2)
 * - View 3: Prakruti Parikshan (Step 2/2)
 * - View 4: Ayurveda Profile (Agni)
 * - View 5: Interactive Dashboard (Direct In-File SPA Mode)
 */

document.addEventListener("DOMContentLoaded", () => {
  // Page Loader Overlay Logic
  const pageLoader = document.getElementById("pageLoader");
  const hidePageLoader = () => {
    if (!pageLoader) return;
    pageLoader.classList.add("hidden");
    setTimeout(() => {
      pageLoader.style.display = "none";
    }, 450);
  };
  setTimeout(hidePageLoader, 350);

  // Elements - Containers & Views
  const loginPageContainer = document.querySelector(".login-page-container");
  const loginCard = document.getElementById("loginCard");
  const personalDetailsCard = document.getElementById("personalDetailsCard");
  const prakrutiCard = document.getElementById("prakrutiCard");
  const securityCard = document.getElementById("securityCard");
  const profileCard = document.getElementById("profileCard");
  const dashboardView = document.getElementById("dashboardView");

  // Elements - Action Links & Buttons
  const createAccountLink = document.getElementById("create-account-link");
  const backToLoginBtn = document.getElementById("backToLoginBtn");
  const backToPersonalBtn = document.getElementById("backToPersonalBtn");
  const backToPersonalFromSecBtn = document.getElementById(
    "backToPersonalFromSecBtn",
  );
  const explorePackagesBtn = document.getElementById("explorePackagesBtn");
  const logoutBtn = document.getElementById("logoutBtn");

  // Dashboard Specific Elements
  const mobileMenuToggle = document.getElementById("mobileMenuToggle");
  const dashboardSidebar = document.getElementById("dashboardSidebar");
  const sidebarOverlay = document.getElementById("sidebarOverlay");
  const periodSelect = document.getElementById("periodSelect");
  const chartTooltip = document.getElementById("chartTooltip");
  const tooltipVal = document.getElementById("tooltipVal");
  const currentYearDisplay = document.getElementById("currentYearDisplay");
  const prevYearBtn = document.getElementById("prevYearBtn");
  const nextYearBtn = document.getElementById("nextYearBtn");

  const toast = document.getElementById("toast");
  const toastMsg = document.getElementById("toastMsg");

  let currentYear = 2026;
  let chartInitialized = false;

  // Helper: Toast Message
  const showToast = (message, isError = false) => {
    if (!toast || !toastMsg) return;
    toastMsg.textContent = message;
    toast.style.background = isError ? "#ef4444" : "#1e293b";
    toast.classList.add("show");

    setTimeout(() => {
      toast.classList.remove("show");
    }, 3200);
  };

  // Helper: Card View Transition Animation
  const animateCardIn = (cardEl) => {
    if (!cardEl) return;
    cardEl.style.display = "block";
    cardEl.style.animation = "none";
    void cardEl.offsetWidth; // Force reflow
    cardEl.style.animation =
      "fadeInCard 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards";
  };

  // Elements - Dashboard Sub-views
  const dashboardOverviewSection = document.getElementById(
    "dashboardOverviewSection",
  );
  const profileSettingsSection = document.getElementById(
    "profileSettingsSection",
  );
  const packagesSection = document.getElementById("packagesSection");
  const dashboardMainHeading = document.getElementById("dashboardMainHeading");
  const userGreeting = document.getElementById("userGreeting");
  const navDashboard = document.getElementById("navDashboard");
  const navPackages = document.getElementById("navPackages");
  const userProfileCard = document.getElementById("userProfileCard");
  const profileSettingsForm = document.getElementById("profileSettingsForm");
  const updateProfileBtn = document.getElementById("updateProfileBtn");

  // Synchronize dynamic user & patient data across dashboard headers and forms
  const syncAppUserData = () => {
    try {
      let storedUser = JSON.parse(
        localStorage.getItem("ocayur_patient_user") ||
          localStorage.getItem("panchved_patient_user") ||
          localStorage.getItem("ocayur_user") ||
          localStorage.getItem("panchved_user") ||
          "null",
      );
      if (
        storedUser &&
        storedUser.role &&
        String(storedUser.role).toLowerCase() !== "patient"
      ) {
        storedUser = null;
      }
      const storedPatient = JSON.parse(
        localStorage.getItem("ocayur_patient") ||
          localStorage.getItem("panchved_patient") ||
          "null",
      );
      if (storedUser || storedPatient) {
        const fullName = storedPatient?.full_name || storedUser?.full_name;
        const patientId =
          storedPatient?.patient_id || "P00" + (storedUser?.id || 1);
        const phone = storedPatient?.phone_number || storedUser?.phone_number;
        const email = storedPatient?.email || storedUser?.email;
        const dob = storedPatient?.dob_formatted || storedPatient?.dob;
        const gender = storedPatient?.gender || "Male";

        if (fullName) {
          const unEl = document.getElementById("userName");
          if (unEl) unEl.textContent = fullName;
          const upc = document.getElementById("userProfileCard");
          if (upc)
            upc.setAttribute(
              "aria-label",
              `User profile: ${fullName}, Patient ID ${patientId}`,
            );
          const mua = document.querySelector(".mobile-user-avatar");
          if (mua) mua.setAttribute("title", `${fullName} (${patientId})`);
        }
        if (patientId) {
          const pidEl = document.getElementById("patientId");
          if (pidEl) pidEl.textContent = patientId;
        }

        // Profile Form Inputs
        const fnInput = document.getElementById("profileFullName");
        if (fnInput && fullName) fnInput.value = fullName;

        const phInput = document.getElementById("profilePhone");
        if (phInput && phone) phInput.value = phone;

        const emInput = document.getElementById("profileEmail");
        if (emInput && email) emInput.value = email;

        const dobInput = document.getElementById("profileDob");
        if (dobInput && dob) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
            const [y, m, d] = dob.split("-");
            dobInput.value = `${d}/${m}/${y}`;
          } else {
            dobInput.value = dob;
          }
        }

        const gInput = document.getElementById("profileGender");
        if (gInput && gender) {
          const matchOpt = Array.from(gInput.options || []).find(
            (opt) => opt.value.toLowerCase() === gender.toLowerCase(),
          );
          if (matchOpt) {
            gInput.value = matchOpt.value;
          } else {
            gInput.value = gender;
          }
        }
      }
    } catch (e) {
      console.warn("syncAppUserData error", e);
    }
  };

  syncAppUserData();

  // 1. Unified Single-Page View Switcher
  const showDashboardSubView = (subView) => {
    // Reset all nav active states
    document
      .querySelectorAll(".dashboard-sidebar .nav-link")
      .forEach((l) => l.classList.remove("active"));
    syncAppUserData();

    const storedPatient = JSON.parse(
      localStorage.getItem("ocayur_patient") ||
        localStorage.getItem("panchved_patient") ||
        "null",
    );
    const storedUser = JSON.parse(
      localStorage.getItem("ocayur_user") ||
        localStorage.getItem("panchved_user") ||
        "null",
    );
    const activeName =
      storedPatient?.full_name || storedUser?.full_name || "Patient";

    if (subView === "packages") {
      if (dashboardOverviewSection)
        dashboardOverviewSection.style.display = "none";
      if (profileSettingsSection) profileSettingsSection.style.display = "none";
      if (packagesSection) {
        packagesSection.style.display = "block";
        packagesSection.style.animation = "none";
        void packagesSection.offsetWidth;
        packagesSection.style.animation =
          "fadeInCard 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards";
      }
      if (dashboardMainHeading) dashboardMainHeading.textContent = "Programmes";
      if (userGreeting)
        userGreeting.textContent = "View and purchase health programmes.";
      if (navPackages) navPackages.classList.add("active");
      history.replaceState(null, "", "#packages");
      showToast("Viewing Health Programmes");
    } else if (subView === "profile" || subView === "settings") {
      if (dashboardOverviewSection)
        dashboardOverviewSection.style.display = "none";
      if (packagesSection) packagesSection.style.display = "none";
      if (profileSettingsSection) {
        profileSettingsSection.style.display = "block";
        profileSettingsSection.style.animation = "none";
        void profileSettingsSection.offsetWidth;
        profileSettingsSection.style.animation =
          "fadeInCard 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards";
      }
      if (dashboardMainHeading)
        dashboardMainHeading.textContent = "Profile Settings";
      if (userGreeting)
        userGreeting.textContent =
          "Manage your personal profile and preferences.";
      history.replaceState(null, "", "#profile-settings");
      showToast("Viewing Profile Settings");
    } else {
      if (profileSettingsSection) profileSettingsSection.style.display = "none";
      if (packagesSection) packagesSection.style.display = "none";
      if (dashboardOverviewSection) {
        dashboardOverviewSection.style.display = "block";
        dashboardOverviewSection.style.animation = "none";
        void dashboardOverviewSection.offsetWidth;
        dashboardOverviewSection.style.animation =
          "fadeInCard 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards";
      }
      if (dashboardMainHeading) dashboardMainHeading.textContent = "Dashboard";
      if (userGreeting)
        userGreeting.textContent = `Good Morning ${activeName}!`;
      if (navDashboard) navDashboard.classList.add("active");
      history.replaceState(null, "", "#dashboard");
      animateDashboardMetrics();
      renderDashboardChart();
    }
  };

  const showView = (viewName, updateHash = true) => {
    // Close open dropdowns
    document
      .querySelectorAll(".custom-select-group.open")
      .forEach((g) => g.classList.remove("open"));

    if (
      viewName === "dashboard" ||
      viewName === "profile-settings" ||
      viewName === "packages"
    ) {
      document.body.classList.add("is-dashboard-active");
      if (loginPageContainer) loginPageContainer.style.display = "none";
      if (loginCard) loginCard.style.display = "none";
      if (personalDetailsCard) personalDetailsCard.style.display = "none";
      if (prakrutiCard) prakrutiCard.style.display = "none";
      if (securityCard) securityCard.style.display = "none";
      if (profileCard) profileCard.style.display = "none";

      if (dashboardView) {
        dashboardView.style.display = "flex";
        dashboardView.style.animation = "none";
        void dashboardView.offsetWidth;
        dashboardView.style.animation =
          "fadeInCard 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards";
      }

      if (viewName === "profile-settings") {
        showDashboardSubView("profile");
      } else if (viewName === "packages") {
        showDashboardSubView("packages");
      } else {
        showDashboardSubView("overview");
      }
      return;
    }

    // Auth Views (Login, Step 1, Step 2, Security Credentials, Ayurveda Profile)
    document.body.classList.remove("is-dashboard-active");
    if (dashboardView) dashboardView.style.display = "none";
    if (loginPageContainer) loginPageContainer.style.display = "flex";

    if (loginCard) loginCard.style.display = "none";
    if (personalDetailsCard) personalDetailsCard.style.display = "none";
    if (prakrutiCard) prakrutiCard.style.display = "none";
    if (securityCard) securityCard.style.display = "none";
    if (profileCard) profileCard.style.display = "none";

    if (viewName === "security-credentials" || viewName === "security") {
      animateCardIn(securityCard);
      if (updateHash) history.replaceState(null, "", "#security-credentials");
      setTimeout(
        () => document.getElementById("securityNewPasswordInput")?.focus(),
        60,
      );
    } else if (viewName === "ayurveda-profile" || viewName === "result") {
      animateCardIn(profileCard);
      if (updateHash) history.replaceState(null, "", "#ayurveda-profile");
    } else if (viewName === "prakruti" || viewName === "step-2") {
      animateCardIn(prakrutiCard);
      if (updateHash) history.replaceState(null, "", "#prakruti");
    } else if (
      viewName === "register" ||
      viewName === "personal-details" ||
      viewName === "step-1"
    ) {
      animateCardIn(personalDetailsCard);
      if (updateHash) history.replaceState(null, "", "#personal-details");
      setTimeout(() => document.getElementById("fullNameInput")?.focus(), 60);
    } else {
      animateCardIn(loginCard);
      if (updateHash) history.replaceState(null, "", "#login");
      setTimeout(
        () => document.getElementById("phoneNumberInput")?.focus(),
        60,
      );
    }
  };

  // 2. Navigation Click Handlers
  if (createAccountLink) {
    createAccountLink.addEventListener("click", (e) => {
      e.preventDefault();
      showView("personal-details");
    });
  }

  if (backToLoginBtn) {
    backToLoginBtn.addEventListener("click", (e) => {
      e.preventDefault();
      showView("login");
    });
  }

  if (backToPersonalBtn) {
    backToPersonalBtn.addEventListener("click", (e) => {
      e.preventDefault();
      showView("personal-details");
    });
  }

  if (backToPersonalFromSecBtn) {
    backToPersonalFromSecBtn.addEventListener("click", (e) => {
      e.preventDefault();
      showView("personal-details");
    });
  }

  if (explorePackagesBtn) {
    explorePackagesBtn.addEventListener("click", (e) => {
      e.preventDefault();
      showToast("Opening Patient Dashboard...");
      setTimeout(() => {
        window.location.href = "dashboard/dashboard.html";
      }, 300);
    });
  }

  // Logout Modal Handlers
  const logoutModal = document.getElementById("logoutModal");
  const closeLogoutModalBtn = document.getElementById("closeLogoutModalBtn");
  const cancelLogoutBtn = document.getElementById("cancelLogoutBtn");
  const confirmLogoutBtn = document.getElementById("confirmLogoutBtn");

  const openLogoutModal = () => {
    if (logoutModal) {
      logoutModal.classList.add("active");
      logoutModal.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
    }
  };

  const closeLogoutModal = () => {
    if (logoutModal) {
      logoutModal.classList.remove("active");
      logoutModal.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
    }
  };

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      if (logoutModal) {
        openLogoutModal();
      } else {
        try {
          await fetch("api/logout.php", { method: "POST" });
        } catch (err) {}
        try {
          localStorage.removeItem("ocayur_user");
          localStorage.removeItem("panchved_user");
          localStorage.removeItem("ocayur_patient");
          localStorage.removeItem("panchved_patient");
          localStorage.removeItem("ocayur_prakruti_result");
          localStorage.removeItem("panchved_prakruti_result");
        } catch (e) {}
        showToast("Logged out successfully.");
        showView("login");
      }
    });
  }

  if (closeLogoutModalBtn)
    closeLogoutModalBtn.addEventListener("click", closeLogoutModal);
  if (cancelLogoutBtn)
    cancelLogoutBtn.addEventListener("click", closeLogoutModal);

  if (logoutModal) {
    logoutModal.addEventListener("click", (e) => {
      if (e.target === logoutModal) closeLogoutModal();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (
      e.key === "Escape" &&
      logoutModal &&
      logoutModal.classList.contains("active")
    ) {
      closeLogoutModal();
    }
  });

  if (confirmLogoutBtn) {
    confirmLogoutBtn.addEventListener("click", async () => {
      confirmLogoutBtn.disabled = true;
      confirmLogoutBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation: spin 0.8s linear infinite; margin-right: 6px;">
          <circle cx="12" cy="12" r="10" stroke-opacity="0.25" stroke="currentColor"></circle>
          <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor"></path>
        </svg>
        <span>Logging out...</span>
      `;
      try {
        await fetch("api/logout.php", { method: "POST" });
      } catch (err) {}
      try {
        localStorage.removeItem("ocayur_user");
        localStorage.removeItem("panchved_user");
        localStorage.removeItem("ocayur_patient");
        localStorage.removeItem("panchved_patient");
        localStorage.removeItem("ocayur_prakruti_result");
        localStorage.removeItem("panchved_prakruti_result");
      } catch (e) {}
      closeLogoutModal();
      showToast("Logged out successfully.");
      showView("login");
      confirmLogoutBtn.disabled = false;
      confirmLogoutBtn.innerHTML = "<span>Yes, Log Out</span>";
    });
  }

  // Handle URL hash routing on initial load & hash change
  const handleHashRouting = () => {
    const hash = window.location.hash;
    if (hash === "#profile-settings" || hash === "#profile") {
      showView("profile-settings", false);
    } else if (hash === "#packages") {
      showView("packages", false);
    } else if (hash === "#dashboard") {
      showView("dashboard", false);
    } else if (hash === "#ayurveda-profile" || hash === "#result") {
      showView("ayurveda-profile", false);
    } else if (hash === "#security-credentials" || hash === "#security") {
      showView("security-credentials", false);
    } else if (hash === "#prakruti" || hash === "#step-2") {
      showView("prakruti", false);
    } else if (
      hash === "#register" ||
      hash === "#personal-details" ||
      hash === "#create-account" ||
      hash === "#step-1"
    ) {
      showView("personal-details", false);
    } else {
      showView("login", false);
    }
  };

  window.addEventListener("hashchange", handleHashRouting);
  if (window.location.hash) {
    handleHashRouting();
  }

  // 3. Custom Select Dropdown Engine (Prakruti Parikshan & Gender)
  const customSelectGroups = document.querySelectorAll(".custom-select-group");

  customSelectGroups.forEach((group) => {
    const trigger = group.querySelector(".custom-select-trigger");
    const options = group.querySelectorAll(".select-option");
    const selectedValueSpan = group.querySelector(".selected-value");
    const hiddenInput = group.querySelector('input[type="hidden"]');

    if (!trigger) return;

    // Toggle Dropdown
    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const isAlreadyOpen = group.classList.contains("open");

      // Close all other dropdowns
      customSelectGroups.forEach((g) => {
        if (g !== group) {
          g.classList.remove("open");
          g.querySelector(".custom-select-trigger")?.setAttribute(
            "aria-expanded",
            "false",
          );
          g.closest(".form-row-grid")?.classList.remove("has-open-dropdown");
        }
      });

      if (isAlreadyOpen) {
        group.classList.remove("open");
        trigger.setAttribute("aria-expanded", "false");
        group.closest(".form-row-grid")?.classList.remove("has-open-dropdown");
      } else {
        group.classList.add("open");
        trigger.setAttribute("aria-expanded", "true");
        group.closest(".form-row-grid")?.classList.add("has-open-dropdown");
      }
    });

    // Keyboard support
    trigger.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        trigger.click();
      } else if (e.key === "Escape") {
        group.classList.remove("open");
        trigger.setAttribute("aria-expanded", "false");
        group.closest(".form-row-grid")?.classList.remove("has-open-dropdown");
      }
    });

    // Option Selection
    options.forEach((option) => {
      option.addEventListener("click", (e) => {
        e.stopPropagation();
        const value =
          option.getAttribute("data-value") || option.textContent.trim();
        const text = option.textContent.trim();

        if (hiddenInput) {
          hiddenInput.value = value;
          hiddenInput.dispatchEvent(new Event("change", { bubbles: true }));
        }

        if (selectedValueSpan) {
          selectedValueSpan.textContent = text;
          selectedValueSpan.title = text;
          selectedValueSpan.classList.remove("placeholder");
        }
        trigger.title = text;

        options.forEach((opt) => opt.classList.remove("selected"));
        option.classList.add("selected");

        group.classList.remove("open");
        trigger.setAttribute("aria-expanded", "false");
        group.closest(".form-row-grid")?.classList.remove("has-open-dropdown");
        trigger.focus();
      });
    });
  });

  // Global click outside to close dropdowns
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".custom-select-group")) {
      customSelectGroups.forEach((g) => {
        g.classList.remove("open");
        g.querySelector(".custom-select-trigger")?.setAttribute(
          "aria-expanded",
          "false",
        );
        g.closest(".form-row-grid")?.classList.remove("has-open-dropdown");
      });
    }
  });

  // 4. Password Visibility Toggle
  const passwordInput = document.getElementById("passwordInput");
  const passwordToggleBtn = document.getElementById("passwordToggleBtn");
  const eyeOffIcon = document.getElementById("eyeOffIcon");
  const eyeOnIcon = document.getElementById("eyeOnIcon");

  if (passwordToggleBtn && passwordInput) {
    passwordToggleBtn.addEventListener("click", () => {
      const isPassword = passwordInput.getAttribute("type") === "password";
      passwordInput.setAttribute("type", isPassword ? "text" : "password");

      if (isPassword) {
        eyeOffIcon.style.display = "none";
        eyeOnIcon.style.display = "block";
        passwordToggleBtn.setAttribute("aria-label", "Hide password");
      } else {
        eyeOffIcon.style.display = "block";
        eyeOnIcon.style.display = "none";
        passwordToggleBtn.setAttribute("aria-label", "Show password");
      }
    });
  }

  // 5. Country Code Selector Dropdown (Login & Personal Details)
  const setupCountryDropdown = (
    selectorId,
    dropdownId,
    codeId,
    phoneInputId,
  ) => {
    const selector = document.getElementById(selectorId);
    const dropdown = document.getElementById(dropdownId);
    const selectedCode = document.getElementById(codeId);
    const phoneInputEl = document.getElementById(phoneInputId);

    if (!selector || !dropdown) return;

    const toggle = (forceClose) => {
      const isExpanded = forceClose
        ? false
        : !dropdown.classList.contains("open");
      document.querySelectorAll(".country-dropdown").forEach((d) => {
        if (d !== dropdown || !isExpanded) {
          d.classList.remove("open");
          d.closest(".country-code-selector")?.setAttribute(
            "aria-expanded",
            "false",
          );
        }
      });

      if (isExpanded) {
        dropdown.classList.add("open");
        selector.setAttribute("aria-expanded", "true");
      } else {
        dropdown.classList.remove("open");
        selector.setAttribute("aria-expanded", "false");
      }
    };

    selector.addEventListener("click", (e) => {
      e.stopPropagation();
      toggle();
    });

    selector.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      } else if (e.key === "Escape") {
        toggle(true);
      }
    });

    const items = dropdown.querySelectorAll(".country-item");
    items.forEach((item) => {
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        const code = item.getAttribute("data-code");
        if (selectedCode) selectedCode.textContent = code;

        items.forEach((i) => i.classList.remove("active"));
        item.classList.add("active");

        toggle(true);
        phoneInputEl?.focus();
      });
    });
  };

  setupCountryDropdown(
    "countryCodeSelector",
    "countryDropdown",
    "selectedCountryCode",
    "phoneNumberInput",
  );
  setupCountryDropdown(
    "personalCountryCodeSelector",
    "personalCountryDropdown",
    "personalSelectedCountryCode",
    "personalPhoneInput",
  );

  // Global click outside to close country dropdowns
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".country-code-selector")) {
      document.querySelectorAll(".country-dropdown").forEach((d) => {
        d.classList.remove("open");
        d.closest(".country-code-selector")?.setAttribute(
          "aria-expanded",
          "false",
        );
      });
    }
  });

  // 6. Restrict Phone Input, Full Name Input & Auto Format DOB
  const restrictPhoneInput = (inputEl, maxDigits = 10) => {
    if (!inputEl) return;
    inputEl.addEventListener("keydown", (e) => {
      // Allow control keys (backspace, delete, tab, arrows, copy/paste shortcuts)
      if (
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        [
          "Backspace",
          "Delete",
          "Tab",
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
          "Home",
          "End",
        ].includes(e.key)
      ) {
        return;
      }
      const digitsOnly = inputEl.value.replace(/\D/g, "");
      const selectedText = window.getSelection
        ? window.getSelection().toString()
        : "";
      if (
        maxDigits &&
        digitsOnly.length >= maxDigits &&
        !selectedText &&
        /^\d$/.test(e.key)
      ) {
        e.preventDefault();
      }
    });
    inputEl.addEventListener("input", () => {
      let val = inputEl.value.replace(/\D/g, "");
      if (maxDigits && val.length > maxDigits) {
        val = val.substring(0, maxDigits);
      }
      inputEl.value = val;
    });
  };
  const phoneInput = document.getElementById("phoneNumberInput");
  const personalPhoneInput = document.getElementById("personalPhoneInput");
  restrictPhoneInput(phoneInput, 10);
  restrictPhoneInput(personalPhoneInput, 10);

  const restrictNameInput = (inputEl) => {
    if (!inputEl) return;
    inputEl.addEventListener("keydown", (e) => {
      // Disallow numeric keys
      if (
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        e.key >= "0" &&
        e.key <= "9"
      ) {
        e.preventDefault();
      }
    });
    inputEl.addEventListener("input", () => {
      inputEl.value = inputEl.value.replace(/[0-9]/g, "");
    });
  };
  const createAccountFullNameInput = document.getElementById("fullNameInput");
  restrictNameInput(createAccountFullNameInput);
  const modalProfileFullNameInput = document.getElementById("profileFullName");
  restrictNameInput(modalProfileFullNameInput);

  const dobInput = document.getElementById("dobInput");
  const dobCalendarBtn = document.getElementById("dobCalendarBtn");
  const dobNativePicker = document.getElementById("dobNativePicker");

  // Restrict calendar picker to current date (disable future dates)
  const setDobPickerMaxDate = () => {
    if (dobNativePicker) {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");
      dobNativePicker.max = `${yyyy}-${mm}-${dd}`;
    }
  };
  setDobPickerMaxDate();

  // Helper: Auto Calculate Exact Age from Date of Birth
  const calculateExactAge = (dobStr) => {
    if (!dobStr) return null;
    let d, m, y;
    const match = String(dobStr)
      .trim()
      .match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (match) {
      d = parseInt(match[1], 10);
      m = parseInt(match[2], 10);
      y = parseInt(match[3], 10);
      if (match[3].length === 2) {
        const currentShort = new Date().getFullYear() % 100;
        y = y > currentShort ? 1900 + y : 2000 + y;
      }
    } else if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(String(dobStr).trim())) {
      const parts = String(dobStr).trim().split("-").map(Number);
      y = parts[0];
      m = parts[1];
      d = parts[2];
    } else {
      return null;
    }

    if (!d || !m || !y || m < 1 || m > 12 || d < 1 || d > 31) return null;

    const birthDate = new Date(y, m - 1, d);
    if (
      birthDate.getFullYear() !== y ||
      birthDate.getMonth() !== m - 1 ||
      birthDate.getDate() !== d
    ) {
      return null;
    }

    const today = new Date();
    if (birthDate > today) return null;

    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
      age--;
    }

    return Math.max(0, age);
  };

  const dobAgeBadge = document.getElementById("dobAgeBadge");
  const dobAgeValue = document.getElementById("dobAgeValue");

  const updateCalculatedAgeUI = (val) => {
    const age = calculateExactAge(val);
    if (age !== null && !isNaN(age)) {
      registrationState.age = age;
      if (dobAgeBadge && dobAgeValue) {
        dobAgeValue.textContent = age;
        dobAgeBadge.style.display = "inline-flex";
      }
    } else {
      if (dobAgeBadge) {
        dobAgeBadge.style.display = "none";
      }
    }
  };

  if (dobInput) {
    dobInput.addEventListener("input", (e) => {
      let val = e.target.value.replace(/\D/g, "");
      if (val.length > 6) val = val.substring(0, 6);

      let formatted = "";
      if (val.length > 0) formatted += val.substring(0, 2);
      if (val.length > 2) formatted += "/" + val.substring(2, 4);
      if (val.length > 4) formatted += "/" + val.substring(4, 6);

      dobInput.value = formatted;
      updateCalculatedAgeUI(formatted);
    });
  }

  // Calendar Icon Button Handler
  if (dobCalendarBtn && dobNativePicker) {
    dobCalendarBtn.addEventListener("click", (e) => {
      e.preventDefault();
      setDobPickerMaxDate();
      try {
        if (typeof dobNativePicker.showPicker === "function") {
          dobNativePicker.showPicker();
        } else {
          dobNativePicker.focus();
          dobNativePicker.click();
        }
      } catch (err) {
        dobNativePicker.focus();
        dobNativePicker.click();
      }
    });

    dobNativePicker.addEventListener("change", () => {
      if (!dobNativePicker.value) return;
      if (dobNativePicker.max && dobNativePicker.value > dobNativePicker.max) {
        dobNativePicker.value = dobNativePicker.max;
      }
      const parts = dobNativePicker.value.split("-"); // YYYY-MM-DD
      if (parts.length === 3) {
        const year = parts[0];
        const month = parts[1];
        const day = parts[2];
        const shortYear = year.slice(-2);
        if (dobInput) {
          dobInput.value = `${day}/${month}/${shortYear}`;
          updateCalculatedAgeUI(dobInput.value);
        }
      }
    });
  }

  // Registration Session State Object
  const registrationState = {
    fullName: "",
    dob: "",
    age: null,
    gender: "",
    height: "",
    weight: "",
    phone: "",
    email: "",
    countryCode: "+91",
    appetite: "",
    sleepType: "",
    dream1: "",
    skinType: "",
    hairType: "",
    bowelMovement: "",
    stressResponse: "",
    bodyTemperature: "",
    physicalActivity: "",
    password: "",
    confirmPassword: "",
  };

  // 7. Form 1: Login Form Submission (Connects to api/login.php)
  const loginForm = document.getElementById("loginForm");
  const loginBtn = document.getElementById("loginBtn");

  if (loginForm && loginBtn) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const phone = phoneInput ? phoneInput.value.trim() : "";
      const password = passwordInput ? passwordInput.value : "";
      const countryCode = selectedCountryCode
        ? selectedCountryCode.textContent.trim()
        : "+91";

      if (!phone) {
        showToast("Please enter your phone number.", true);
        phoneInput?.focus();
        return;
      }

      if (!password) {
        showToast("Please enter your password.", true);
        passwordInput?.focus();
        return;
      }

      const originalHtml = loginBtn.innerHTML;
      loginBtn.disabled = true;
      loginBtn.style.opacity = "0.85";
      loginBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="animation: spin 0.8s linear infinite;">
          <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)"></circle>
          <path d="M12 2a10 10 0 0 1 10 10" stroke="#ffffff"></path>
        </svg>
        <span>Logging in...</span>
      `;

      try {
        const response = await fetch("api/login.php", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            phone: phone,
            password: password,
            country_code: countryCode,
          }),
        });

        const result = await response.json();

        if (response.ok && result.success) {
          try {
            localStorage.removeItem("ocayur_booked_packages");
            localStorage.removeItem("panchved_booked_packages");
          } catch (e) {}
          if (result.user) {
            try {
              localStorage.setItem(
                "ocayur_patient_user",
                JSON.stringify(result.user),
              );
              localStorage.setItem(
                "panchved_patient_user",
                JSON.stringify(result.user),
              );
              localStorage.setItem("ocayur_user", JSON.stringify(result.user));
            } catch (e) {}
          }
          if (result.patient) {
            try {
              localStorage.setItem(
                "ocayur_patient",
                JSON.stringify(result.patient),
              );
              localStorage.setItem(
                "panchved_patient",
                JSON.stringify(result.patient),
              );
            } catch (e) {}
          }

          showToast(
            result.message || "Login successful! Welcome to Dashboard.",
          );
          setTimeout(() => {
            window.location.href = "dashboard/dashboard.html";
          }, 350);
        } else {
          loginBtn.disabled = false;
          loginBtn.style.opacity = "1";
          loginBtn.innerHTML = originalHtml;
          showToast(
            result.message || "Invalid phone number or password.",
            true,
          );
        }
      } catch (err) {
        console.error("Login network error:", err);
        loginBtn.disabled = false;
        loginBtn.style.opacity = "1";
        loginBtn.innerHTML = originalHtml;
        showToast("Connection error during login. Please try again.", true);
      }
    });
  }

  // Developer Console Login Bypass: bypass(number)
  window.bypass = async function (number) {
    if (!number) {
      const phoneInput = document.getElementById("phoneNumberInput");
      if (phoneInput && phoneInput.value.trim()) {
        number = phoneInput.value.trim();
      }
    }

    if (!number) {
      console.warn(
        'Please provide a phone number. Example: bypass("9876543210") or enter phone number in the field',
      );
      if (typeof showToast === "function") {
        showToast("Please provide or enter a phone number to bypass login", true);
      }
      return 'Please provide a phone number. Example: bypass("9876543210")';
    }

    const countryCodeElem = document.getElementById("selectedCountryCode");
    const countryCode = countryCodeElem
      ? countryCodeElem.textContent.trim()
      : "+91";

    const phone = String(number)
      .trim()
      .replace(/[^\d+]/g, "");
    console.log(`[Bypass] Initiating login bypass via login.php for phone: ${phone}...`);

    if (typeof showToast === "function") {
      showToast(`Logging in as ${phone}...`);
    }

    try {
      const response = await fetch("api/login.php", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          phone: phone,
          bypass: true,
          country_code: countryCode,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        try {
          localStorage.removeItem("ocayur_booked_packages");
          localStorage.removeItem("panchved_booked_packages");
        } catch (e) {}

        if (result.user) {
          try {
            localStorage.setItem(
              "ocayur_patient_user",
              JSON.stringify(result.user),
            );
            localStorage.setItem(
              "panchved_patient_user",
              JSON.stringify(result.user),
            );
            localStorage.setItem("ocayur_user", JSON.stringify(result.user));
          } catch (e) {}
        }
        if (result.patient) {
          try {
            localStorage.setItem(
              "ocayur_patient",
              JSON.stringify(result.patient),
            );
            localStorage.setItem(
              "panchved_patient",
              JSON.stringify(result.patient),
            );
          } catch (e) {}
        }

        console.log(
          `[Bypass] Authenticated as ${result.patient?.full_name || result.user?.full_name || phone}. Redirecting to dashboard...`,
        );
        if (typeof showToast === "function") {
          showToast(
            result.message || `Login successful for ${phone}! Redirecting...`,
          );
        }

        setTimeout(() => {
          window.location.href = "dashboard/dashboard.html";
        }, 350);

        return `Bypassing login for ${phone}... Redirecting to dashboard...`;
      } else {
        const errMsg = result.message || "Bypass login failed.";
        console.error("[Bypass] Failed:", errMsg);
        if (typeof showToast === "function") {
          showToast(errMsg, true);
        }
        return `Bypass failed: ${errMsg}`;
      }
    } catch (err) {
      console.error("[Bypass] Error communicating with api/login.php:", err);
      if (typeof showToast === "function") {
        showToast("Connection error during bypass login.", true);
      }
      return `Bypass network error: ${err.message}`;
    }
  };

  // 8. Form 2: Personal Details Submission (Step 1/3 -> Step 2/3)
  const personalDetailsForm = document.getElementById("personalDetailsForm");
  const continueBtn = document.getElementById("continueBtn");
  const fullNameInput = document.getElementById("fullNameInput");
  const genderSelect = document.getElementById("genderSelect");
  const heightInput = document.getElementById("heightInput");
  const heightFeetInput = document.getElementById("heightFeetInput");
  const heightInchesInput = document.getElementById("heightInchesInput");
  const weightInput = document.getElementById("weightInput");
  const personalSelectedCountryCode = document.getElementById(
    "personalSelectedCountryCode",
  );
  const emailInput = document.getElementById("emailInput");

  // Synchronize Feet & Inches into heightInput
  const syncHeightCombined = () => {
    const feet = heightFeetInput ? heightFeetInput.value.trim() : "";
    const inches = heightInchesInput ? heightInchesInput.value.trim() : "";
    if (feet !== "" || inches !== "") {
      const fNum = feet !== "" ? parseInt(feet, 10) : 0;
      const iNum = inches !== "" ? parseInt(inches, 10) : 0;
      if (heightInput) {
        heightInput.value = `${fNum} ft ${iNum} in`;
      }
    } else {
      if (heightInput) heightInput.value = "";
    }
  };

  [heightFeetInput, heightInchesInput].forEach((inp) => {
    if (inp) {
      inp.addEventListener("input", syncHeightCombined);
      inp.addEventListener("keydown", (e) => {
        if (["e", "E", "+", "-"].includes(e.key)) {
          e.preventDefault();
        }
      });
    }
  });

  if (personalPhoneInput) {
    personalPhoneInput.addEventListener("blur", async () => {
      const digits = personalPhoneInput.value.replace(/\D/g, "");
      if (digits.length === 10) {
        try {
          const res = await fetch(
            `api/create_account.php?check_phone=${encodeURIComponent(digits)}`,
          );
          const checkData = await res.json();
          if (checkData && checkData.exists) {
            showToast(
              checkData.message ||
                "This phone number is already registered. Please log in or use a different number.",
              true,
            );
          }
        } catch (e) {}
      }
    });
  }

  if (personalDetailsForm && continueBtn) {
    personalDetailsForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const name = fullNameInput ? fullNameInput.value.trim() : "";
      const dob = dobInput ? dobInput.value.trim() : "";
      const gender = genderSelect ? genderSelect.value : "";
      let height = heightInput ? heightInput.value.trim() : "";
      const weight = weightInput ? weightInput.value.trim() : "";
      const phone = personalPhoneInput
        ? personalPhoneInput.value.trim()
        : phoneInput
          ? phoneInput.value.trim()
          : "";
      const email = emailInput ? emailInput.value.trim() : "";
      const countryCode = personalSelectedCountryCode
        ? personalSelectedCountryCode.textContent.trim()
        : "+91";

      if (!name) {
        showToast("Please enter your Full Name.", true);
        fullNameInput?.focus();
        return;
      }

      if (/\d/.test(name)) {
        showToast("Full Name cannot contain numbers.", true);
        fullNameInput?.focus();
        return;
      }

      if (!dob) {
        showToast("Please enter your Date of Birth (dd/mm/yy).", true);
        dobInput?.focus();
        return;
      }

      // Check if Date of Birth is in the future
      const dobMatch = dob.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
      if (dobMatch) {
        const d = parseInt(dobMatch[1], 10);
        const m = parseInt(dobMatch[2], 10);
        let y = parseInt(dobMatch[3], 10);
        if (dobMatch[3].length === 2) {
          const currentYear = new Date().getFullYear();
          const currentShort = currentYear % 100;
          y = y > currentShort ? 1900 + y : 2000 + y;
        }
        const enteredDate = new Date(y, m - 1, d);
        const now = new Date();
        now.setHours(23, 59, 59, 999);
        if (enteredDate > now) {
          showToast("Date of Birth cannot be in the future.", true);
          dobInput?.focus();
          return;
        }
      }

      if (!gender) {
        showToast("Please select your Gender.", true);
        document
          .querySelector('[data-select-id="gender"] .custom-select-trigger')
          ?.focus();
        return;
      }

      const feet = heightFeetInput ? heightFeetInput.value.trim() : "";
      const inches = heightInchesInput ? heightInchesInput.value.trim() : "";

      if (!feet && !inches && !height) {
        showToast("Please enter your Height in feet and inches.", true);
        (heightFeetInput || heightInput)?.focus();
        return;
      }

      if (!feet) {
        showToast("Please enter your height in feet.", true);
        heightFeetInput?.focus();
        return;
      }

      const feetVal = parseInt(feet, 10);
      if (isNaN(feetVal) || feetVal < 1 || feetVal > 8) {
        showToast("Please enter a valid height in feet (1-8 ft).", true);
        heightFeetInput?.focus();
        return;
      }

      const inchesVal = inches !== "" ? parseInt(inches, 10) : 0;
      if (isNaN(inchesVal) || inchesVal < 0 || inchesVal > 11) {
        showToast("Please enter valid inches (0-11 in).", true);
        heightInchesInput?.focus();
        return;
      }

      height = `${feetVal} ft ${inchesVal} in`;
      if (heightInput) heightInput.value = height;

      if (!weight) {
        showToast("Please enter your Weight.", true);
        weightInput?.focus();
        return;
      }

      const phoneDigits = phone.replace(/\D/g, "");
      if (!phone || phoneDigits.length !== 10) {
        showToast("Please enter a valid 10-digit phone number.", true);
        personalPhoneInput?.focus();
        return;
      }

      if (!email) {
        showToast("Please enter your Email Address.", true);
        emailInput?.focus();
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        showToast("Please enter a valid email address.", true);
        emailInput?.focus();
        return;
      }

      const originalHtml = continueBtn.innerHTML;
      continueBtn.disabled = true;
      continueBtn.style.opacity = "0.85";
      continueBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="animation: spin 0.8s linear infinite;">
          <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)"></circle>
          <path d="M12 2a10 10 0 0 1 10 10" stroke="#ffffff"></path>
        </svg>
        <span>Verifying details...</span>
      `;

      // Check if phone number is already registered in backend
      try {
        const phoneCheckRes = await fetch(
          `api/create_account.php?check_phone=${encodeURIComponent(phoneDigits)}`,
        );
        const phoneCheckData = await phoneCheckRes.json();
        if (phoneCheckData && phoneCheckData.exists) {
          continueBtn.disabled = false;
          continueBtn.style.opacity = "1";
          continueBtn.innerHTML = originalHtml;
          showToast(
            phoneCheckData.message ||
              "This phone number is already registered. Please log in or use a different number.",
            true,
          );
          personalPhoneInput?.focus();
          return;
        }
      } catch (err) {
        console.warn("Phone verification check error:", err);
      }

      const referralCodeInput = document.getElementById("referralCodeInput");
      const referralCode = referralCodeInput
        ? referralCodeInput.value.trim().toUpperCase()
        : "";

      // Save into registration state
      registrationState.fullName = name;
      registrationState.dob = dob;
      registrationState.age = calculateExactAge(dob);
      registrationState.gender = gender;
      registrationState.height = height;
      registrationState.weight = weight;
      registrationState.phone = phone;
      registrationState.email = email;
      registrationState.countryCode = countryCode;
      registrationState.referralCode = referralCode;

      try {
        localStorage.setItem("ocayur_registration_phone", phone);
        localStorage.setItem("ocayur_registration_email", email);
        localStorage.setItem("ocayur_registration_referral_code", referralCode);
        localStorage.setItem(
          "ocayur_registration_data",
          JSON.stringify(registrationState),
        );
      } catch (e) {}

      continueBtn.disabled = false;
      continueBtn.style.opacity = "1";
      continueBtn.innerHTML = originalHtml;
      showToast("Personal details saved! Proceeding to Prakruti Parikshan...");
      showView("prakruti");
    });
  }

  // 9. Form 3: Prakruti Parikshan Submission (Step 2/3 -> Step 3/3)
  const prakrutiForm = document.getElementById("prakrutiForm");
  const submitPrakrutiBtn = document.getElementById("submitPrakrutiBtn");

  if (prakrutiForm && submitPrakrutiBtn) {
    prakrutiForm.addEventListener("submit", (e) => {
      e.preventDefault();

      const appetite = document.getElementById("appetiteInput")?.value;
      const sleepType = document.getElementById("sleepTypeInput")?.value;
      const skinType = document.getElementById("skinTypeInput")?.value;
      const hairType = document.getElementById("hairTypeInput")?.value;
      const bowelMovement =
        document.getElementById("bowelMovementInput")?.value;
      const stressResponse = document.getElementById(
        "stressResponseInput",
      )?.value;
      const bodyTemperature = document.getElementById(
        "bodyTemperatureInput",
      )?.value;
      const physicalActivity = document.getElementById(
        "physicalActivityInput",
      )?.value;

      if (!appetite) {
        showToast("Please select your Appetite pattern.", true);
        document
          .querySelector('[data-select-id="appetite"] .custom-select-trigger')
          ?.focus();
        return;
      }

      if (!sleepType) {
        showToast("Please select your Sleep Type.", true);
        document
          .querySelector('[data-select-id="sleepType"] .custom-select-trigger')
          ?.focus();
        return;
      }

      if (!skinType) {
        showToast("Please select your Skin Type.", true);
        document
          .querySelector('[data-select-id="skinType"] .custom-select-trigger')
          ?.focus();
        return;
      }

      if (!hairType) {
        showToast("Please select your Hair Type.", true);
        document
          .querySelector('[data-select-id="hairType"] .custom-select-trigger')
          ?.focus();
        return;
      }

      if (!bowelMovement) {
        showToast("Please select your Bowel Movement.", true);
        document
          .querySelector(
            '[data-select-id="bowelMovement"] .custom-select-trigger',
          )
          ?.focus();
        return;
      }

      if (!stressResponse) {
        showToast("Please select your Stress Response.", true);
        document
          .querySelector(
            '[data-select-id="stressResponse"] .custom-select-trigger',
          )
          ?.focus();
        return;
      }

      if (!bodyTemperature) {
        showToast("Please select your Body Temperature tendency.", true);
        document
          .querySelector(
            '[data-select-id="bodyTemperature"] .custom-select-trigger',
          )
          ?.focus();
        return;
      }

      if (!physicalActivity) {
        showToast("Please select your Physical Activity style.", true);
        document
          .querySelector(
            '[data-select-id="physicalActivity"] .custom-select-trigger',
          )
          ?.focus();
        return;
      }

      const agreeTermsCheckbox = document.getElementById("agreeTermsCheckbox");
      if (agreeTermsCheckbox && !agreeTermsCheckbox.checked) {
        showToast(
          "Please agree to the Terms & Conditions and Disclaimer to proceed.",
          true,
        );
        const container = agreeTermsCheckbox.closest(
          ".terms-agreement-container",
        );
        if (container) {
          container.classList.add("has-error");
          setTimeout(() => container.classList.remove("has-error"), 1800);
        }
        agreeTermsCheckbox.focus();
        return;
      }

      // Save into registration state
      registrationState.appetite = appetite;
      registrationState.sleepType = sleepType;
      registrationState.skinType = skinType;
      registrationState.hairType = hairType;
      registrationState.bowelMovement = bowelMovement;
      registrationState.stressResponse = stressResponse;
      registrationState.bodyTemperature = bodyTemperature;
      registrationState.physicalActivity = physicalActivity;
      registrationState.termsAccepted = true;

      try {
        localStorage.setItem(
          "ocayur_registration_data",
          JSON.stringify(registrationState),
        );
      } catch (e) {}

      const originalHtml = submitPrakrutiBtn.innerHTML;
      submitPrakrutiBtn.disabled = true;
      submitPrakrutiBtn.style.opacity = "0.85";
      submitPrakrutiBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="animation: spin 0.8s linear infinite;">
          <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)"></circle>
          <path d="M12 2a10 10 0 0 1 10 10" stroke="#ffffff"></path>
        </svg>
        <span>Saving assessment...</span>
      `;

      setTimeout(() => {
        submitPrakrutiBtn.disabled = false;
        submitPrakrutiBtn.style.opacity = "1";
        submitPrakrutiBtn.innerHTML = originalHtml;
        showToast("Assessment saved! Proceeding to Security Credentials...");
        showView("security-credentials");
      }, 400);
    });
  }

  // 9b. Security Credentials Form Submission (Step 3/3 -> Connects to api/create_account.php)
  const securityForm = document.getElementById("securityForm");
  const submitSecurityBtn = document.getElementById("submitSecurityBtn");
  const secNewPasswordInput = document.getElementById(
    "securityNewPasswordInput",
  );
  const secConfirmPasswordInput = document.getElementById(
    "securityConfirmPasswordInput",
  );
  const secNewPasswordToggleBtn = document.getElementById(
    "secNewPasswordToggleBtn",
  );
  const secConfirmPasswordToggleBtn = document.getElementById(
    "secConfirmPasswordToggleBtn",
  );

  const setupSecToggle = (inputEl, toggleBtnEl) => {
    if (!inputEl || !toggleBtnEl) return;
    const eyeOff = toggleBtnEl.querySelector(".eye-off-icon");
    const eyeOn = toggleBtnEl.querySelector(".eye-on-icon");

    toggleBtnEl.addEventListener("click", (e) => {
      e.preventDefault();
      const isPassword = inputEl.getAttribute("type") === "password";
      inputEl.setAttribute("type", isPassword ? "text" : "password");
      if (eyeOff && eyeOn) {
        eyeOff.style.display = isPassword ? "none" : "block";
        eyeOn.style.display = isPassword ? "block" : "none";
      }
    });
  };

  setupSecToggle(secNewPasswordInput, secNewPasswordToggleBtn);
  setupSecToggle(secConfirmPasswordInput, secConfirmPasswordToggleBtn);

  if (securityForm && submitSecurityBtn) {
    securityForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const newPass = secNewPasswordInput
        ? secNewPasswordInput.value.trim()
        : "";
      const confirmPass = secConfirmPasswordInput
        ? secConfirmPasswordInput.value.trim()
        : "";

      if (!newPass) {
        showToast("Please enter your new password.", true);
        secNewPasswordInput?.focus();
        return;
      }

      if (newPass.length < 6) {
        showToast("Password must be at least 6 characters long.", true);
        secNewPasswordInput?.focus();
        return;
      }

      if (!confirmPass) {
        showToast("Please confirm your new password.", true);
        secConfirmPasswordInput?.focus();
        return;
      }

      if (newPass !== confirmPass) {
        showToast("Passwords do not match. Please try again.", true);
        secConfirmPasswordInput?.focus();
        return;
      }

      registrationState.password = newPass;
      registrationState.confirmPassword = confirmPass;

      // Fallback phone if blank
      if (!registrationState.phone) {
        const storedRegPhone =
          localStorage.getItem("ocayur_registration_phone") ||
          localStorage.getItem("panchved_registration_phone");
        if (storedRegPhone) {
          registrationState.phone = storedRegPhone;
        } else if (personalPhoneInput && personalPhoneInput.value.trim()) {
          registrationState.phone = personalPhoneInput.value.trim();
        } else if (phoneInput && phoneInput.value.trim()) {
          registrationState.phone = phoneInput.value.trim();
        } else {
          showToast(
            "Please enter your phone number to complete registration.",
            true,
          );
          return;
        }
      }

      // Fallback email if blank
      if (!registrationState.email) {
        const storedRegEmail =
          localStorage.getItem("ocayur_registration_email") ||
          localStorage.getItem("panchved_registration_email");
        if (storedRegEmail) {
          registrationState.email = storedRegEmail;
        } else if (emailInput && emailInput.value.trim()) {
          registrationState.email = emailInput.value.trim();
        }
      }

      const originalHtml = submitSecurityBtn.innerHTML;
      submitSecurityBtn.disabled = true;
      submitSecurityBtn.style.opacity = "0.85";
      submitSecurityBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="animation: spin 0.8s linear infinite;">
          <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)"></circle>
          <path d="M12 2a10 10 0 0 1 10 10" stroke="#ffffff"></path>
        </svg>
        <span>Creating account...</span>
      `;

      try {
        const response = await fetch("api/create_account.php", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(registrationState),
        });

        const result = await response.json();

        if (response.ok && result.success) {
          try {
            localStorage.removeItem("ocayur_booked_packages");
            localStorage.removeItem("panchved_booked_packages");
          } catch (e) {}
          if (result.user) {
            try {
              localStorage.setItem("ocayur_user", JSON.stringify(result.user));
            } catch (e) {}
          }
          if (result.patient) {
            try {
              localStorage.setItem(
                "ocayur_patient",
                JSON.stringify(result.patient),
              );
            } catch (e) {}
          }

          if (result.prakruti_result) {
            try {
              localStorage.setItem(
                "ocayur_prakruti_result",
                JSON.stringify(result.prakruti_result),
              );
            } catch (e) {}
            const profileTypeName = document.getElementById("profileTypeName");
            const profileDescription =
              document.getElementById("profileDescription");
            if (profileTypeName && result.prakruti_result.title) {
              profileTypeName.textContent = result.prakruti_result.title;
            }
            if (profileDescription && result.prakruti_result.description) {
              profileDescription.textContent =
                result.prakruti_result.description;
            }
          }

          submitSecurityBtn.disabled = false;
          submitSecurityBtn.style.opacity = "1";
          submitSecurityBtn.innerHTML = originalHtml;

          showToast(result.message || "Account created successfully!");
          setTimeout(() => {
            window.location.href = "ayurveda-profile.html";
          }, 350);
        } else {
          submitSecurityBtn.disabled = false;
          submitSecurityBtn.style.opacity = "1";
          submitSecurityBtn.innerHTML = originalHtml;
          showToast(result.message || "Failed to create account.", true);
        }
      } catch (err) {
        console.error("Registration network error:", err);
        submitSecurityBtn.disabled = false;
        submitSecurityBtn.style.opacity = "1";
        submitSecurityBtn.innerHTML = originalHtml;
        showToast(
          "Network error while creating account. Please try again.",
          true,
        );
      }
    });
  }

  // 10. Dashboard Interactive Logic (Sidebar, Counter, Chart Engine)
  const toggleMobileSidebar = (open) => {
    if (!dashboardSidebar || !sidebarOverlay) return;
    const shouldOpen =
      open !== undefined ? open : !dashboardSidebar.classList.contains("open");
    if (shouldOpen) {
      dashboardSidebar.classList.add("open");
      sidebarOverlay.classList.add("active");
      document.body.style.overflow = "hidden";
    } else {
      dashboardSidebar.classList.remove("open");
      sidebarOverlay.classList.remove("active");
      document.body.style.overflow = "";
    }
  };

  if (mobileMenuToggle) {
    mobileMenuToggle.addEventListener("click", () => toggleMobileSidebar());
  }

  if (sidebarOverlay) {
    sidebarOverlay.addEventListener("click", () => toggleMobileSidebar(false));
  }

  // Dashboard Nav Links Active State & Feedback
  const dashboardNavLinks = document.querySelectorAll(
    ".dashboard-sidebar .nav-link",
  );
  dashboardNavLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      const href = link.getAttribute("href");
      if (href === "#packages") {
        e.preventDefault();
        showDashboardSubView("packages");
        if (window.innerWidth <= 820) toggleMobileSidebar(false);
      } else if (href === "#dashboard") {
        e.preventDefault();
        showDashboardSubView("overview");
        if (window.innerWidth <= 820) toggleMobileSidebar(false);
      } else if (href.startsWith("#")) {
        e.preventDefault();
        dashboardNavLinks.forEach((l) => l.classList.remove("active"));
        link.classList.add("active");
        showToast(
          `Viewing ${link.querySelector(".nav-label")?.textContent || "section"}`,
        );
        if (window.innerWidth <= 820) toggleMobileSidebar(false);
      }
    });
  });

  // Animated Counter on Metric Cards
  const animateDashboardMetrics = () => {
    document.querySelectorAll(".stat-card-value").forEach((el) => {
      const target = parseInt(
        el.getAttribute("data-target") || el.textContent,
        10,
      );
      let startTimestamp = null;
      const duration = 650;
      const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.floor(easeProgress * target);
        if (progress < 1) {
          window.requestAnimationFrame(step);
        } else {
          el.textContent = target;
        }
      };
      window.requestAnimationFrame(step);
    });
  };

  // Year Switcher
  const updateYear = (delta) => {
    currentYear += delta;
    if (currentYearDisplay) currentYearDisplay.textContent = currentYear;
    showToast(`Showing appointments data for ${currentYear}`);
    renderDashboardChart();
  };

  if (prevYearBtn) prevYearBtn.addEventListener("click", () => updateYear(-1));
  if (nextYearBtn) nextYearBtn.addEventListener("click", () => updateYear(1));

  // Chart Dataset (Exact curve match from Figma design)
  const chartDatasets = {
    "12m": [
      { month: "Oct", val: 6.8, count: 120 },
      { month: "Nov", val: 1.8, count: 35 },
      { month: "Dec", val: 3.2, count: 70 },
      { month: "Jan", val: 2.0, count: 42 },
      { month: "Feb", val: 5.0, count: 150 }, // Figma highlighted tooltip
      { month: "March", val: 1.2, count: 28 },
      { month: "April", val: 5.8, count: 110 },
      { month: "May", val: 1.5, count: 30 },
      { month: "June", val: 5.6, count: 115 },
      { month: "July", val: 5.1, count: 98 },
      { month: "Aug", val: 9.2, count: 210 },
      { month: "Sep", val: 4.1, count: 85 },
    ],
    "6m": [
      { month: "April", val: 5.8, count: 110 },
      { month: "May", val: 1.5, count: 30 },
      { month: "June", val: 5.6, count: 115 },
      { month: "July", val: 5.1, count: 98 },
      { month: "Aug", val: 9.2, count: 210 },
      { month: "Sep", val: 4.1, count: 85 },
    ],
    "3m": [
      { month: "July", val: 5.1, count: 98 },
      { month: "Aug", val: 9.2, count: 210 },
      { month: "Sep", val: 4.1, count: 85 },
    ],
    2026: [
      { month: "Jan", val: 2.0, count: 42 },
      { month: "Feb", val: 5.0, count: 150 },
      { month: "March", val: 1.2, count: 28 },
      { month: "April", val: 5.8, count: 110 },
      { month: "May", val: 1.5, count: 30 },
      { month: "June", val: 5.6, count: 115 },
      { month: "July", val: 5.1, count: 98 },
      { month: "Aug", val: 9.2, count: 210 },
      { month: "Sep", val: 4.1, count: 85 },
    ],
  };

  const svg = document.getElementById("appointmentsChartSvg");
  const chartLinePath = document.getElementById("chartLinePath");
  const chartAreaPath = document.getElementById("chartAreaPath");
  const chartPointsGroup = document.getElementById("chartPointsGroup");
  const xAxisLabelsGroup = document.getElementById("xAxisLabelsGroup");
  const svgChartWrapper = document.getElementById("svgChartWrapper");

  // Catmull-Rom Spline Interpolator
  const getSplinePath = (points) => {
    if (points.length === 0) return "";
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

    let path = `M ${points[0].x} ${points[0].y}`;

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = i > 0 ? points[i - 1] : points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = i !== points.length - 2 ? points[i + 2] : p2;

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;

      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }

    return path;
  };

  const renderDashboardChart = () => {
    if (
      !svg ||
      !chartLinePath ||
      !chartAreaPath ||
      !chartPointsGroup ||
      !xAxisLabelsGroup
    )
      return;

    const selectedPeriod = periodSelect ? periodSelect.value : "12m";
    const data = chartDatasets[selectedPeriod] || chartDatasets["12m"];

    const startX = 65;
    const endX = 860;
    const minY = 30;
    const maxY = 330;
    const totalY = maxY - minY;

    const stepX = (endX - startX) / (data.length - 1);

    const points = data.map((d, index) => {
      const x = startX + index * stepX;
      const y = maxY - (d.val / 10) * totalY;
      return { x, y, data: d, index };
    });

    const linePathD = getSplinePath(points);
    chartLinePath.setAttribute("d", linePathD);

    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];
    const areaPathD = `${linePathD} L ${lastPoint.x} ${maxY} L ${firstPoint.x} ${maxY} Z`;
    chartAreaPath.setAttribute("d", areaPathD);

    xAxisLabelsGroup.innerHTML = "";
    chartPointsGroup.innerHTML = "";

    let defaultTooltipTarget = null;

    points.forEach((pt) => {
      const text = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text",
      );
      text.setAttribute("x", pt.x.toString());
      text.setAttribute("y", "352");
      text.setAttribute("class", "axis-label x-label");
      text.textContent = pt.data.month;
      xAxisLabelsGroup.appendChild(text);

      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("class", "chart-point-marker");
      g.style.cursor = "pointer";

      const outerCircle = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle",
      );
      outerCircle.setAttribute("cx", pt.x.toString());
      outerCircle.setAttribute("cy", pt.y.toString());
      outerCircle.setAttribute("r", "6");
      outerCircle.setAttribute("class", "chart-data-dot outer");

      const innerCircle = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle",
      );
      innerCircle.setAttribute("cx", pt.x.toString());
      innerCircle.setAttribute("cy", pt.y.toString());
      innerCircle.setAttribute("r", "3");
      innerCircle.setAttribute("class", "chart-data-dot inner");

      g.appendChild(outerCircle);
      g.appendChild(innerCircle);

      g.addEventListener("mouseenter", () => positionTooltip(pt));
      g.addEventListener("click", () => positionTooltip(pt));

      chartPointsGroup.appendChild(g);

      if (pt.data.month === "Feb") {
        defaultTooltipTarget = pt;
      }
    });

    if (defaultTooltipTarget) {
      positionTooltip(defaultTooltipTarget);
    } else if (points.length > 0) {
      positionTooltip(points[Math.floor(points.length / 2)]);
    }
  };

  const positionTooltip = (point) => {
    if (!chartTooltip || !tooltipVal || !svgChartWrapper) return;

    tooltipVal.textContent = point.data.count;

    const percentX = (point.x / 900) * 100;
    const percentY = (point.y / 360) * 100;

    chartTooltip.style.left = `${percentX}%`;
    chartTooltip.style.top = `${percentY}%`;
    chartTooltip.style.opacity = "1";
  };

  if (periodSelect) {
    periodSelect.addEventListener("change", () => {
      renderDashboardChart();
      showToast(
        `Filter updated to ${periodSelect.options[periodSelect.selectedIndex].text}`,
      );
    });
  }

  window.addEventListener("resize", () => {
    if (document.body.classList.contains("is-dashboard-active")) {
      renderDashboardChart();
    }
  });

  // User Profile Pill Click -> Switch to Profile Settings
  if (userProfileCard) {
    userProfileCard.addEventListener("click", () => {
      showDashboardSubView("profile");
    });
  }

  // Package Action Buttons
  document.querySelectorAll(".btn-package-action").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const pkgTitle = btn.getAttribute("data-package") || "Programme";
      showToast(
        `Selected "${pkgTitle}". Proceeding to consultation booking...`,
      );
    });
  });

  // Modal Profile Date Picker Wiring
  const modalProfileDobCalendarBtn = document.getElementById(
    "modalProfileDobCalendarBtn",
  );
  const modalProfileDobNativePicker = document.getElementById(
    "modalProfileDobNativePicker",
  );
  const modalProfileDobInput = document.getElementById("profileDob");

  if (modalProfileDobNativePicker) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    modalProfileDobNativePicker.max = `${yyyy}-${mm}-${dd}`;
  }

  if (modalProfileDobCalendarBtn && modalProfileDobNativePicker) {
    modalProfileDobCalendarBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (modalProfileDobInput && modalProfileDobInput.value) {
        const parts = modalProfileDobInput.value.trim().split("/");
        if (parts.length === 3 && parts[2].length === 4) {
          const d = parts[0].padStart(2, "0");
          const m = parts[1].padStart(2, "0");
          const y = parts[2];
          const isoDate = `${y}-${m}-${d}`;
          if (
            !modalProfileDobNativePicker.max ||
            isoDate <= modalProfileDobNativePicker.max
          ) {
            modalProfileDobNativePicker.value = isoDate;
          }
        }
      }
      try {
        if (typeof modalProfileDobNativePicker.showPicker === "function") {
          modalProfileDobNativePicker.showPicker();
        } else {
          modalProfileDobNativePicker.focus();
          modalProfileDobNativePicker.click();
        }
      } catch (err) {
        modalProfileDobNativePicker.focus();
        modalProfileDobNativePicker.click();
      }
    });

    modalProfileDobNativePicker.addEventListener("change", () => {
      if (!modalProfileDobNativePicker.value) return;
      if (
        modalProfileDobNativePicker.max &&
        modalProfileDobNativePicker.value > modalProfileDobNativePicker.max
      ) {
        modalProfileDobNativePicker.value = modalProfileDobNativePicker.max;
      }
      const parts = modalProfileDobNativePicker.value.split("-");
      if (parts.length === 3 && modalProfileDobInput) {
        modalProfileDobInput.value = `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
    });
  }

  // Profile Settings Form Submission
  if (profileSettingsForm && updateProfileBtn) {
    profileSettingsForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const fullName = document.getElementById("profileFullName")?.value.trim();
      const email = document.getElementById("profileEmail")?.value.trim();
      const phone = document.getElementById("profilePhone")?.value.trim();
      const dob = document.getElementById("profileDob")?.value.trim();
      const gender =
        document.getElementById("profileGender")?.value.trim() || "Male";

      if (!fullName) {
        showToast("Please enter your full name.", true);
        return;
      }

      if (/\d/.test(fullName)) {
        showToast("Full name should not contain numbers.", true);
        return;
      }

      if (!dob) {
        showToast("Please enter your date of birth.", true);
        return;
      }

      if (dob) {
        let dobDate = null;
        if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dob)) {
          const [d, m, y] = dob.split("/");
          dobDate = new Date(`${y}-${m}-${d}`);
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
          dobDate = new Date(dob);
        }
        if (dobDate && !isNaN(dobDate.getTime())) {
          const today = new Date();
          today.setHours(23, 59, 59, 999);
          if (dobDate > today) {
            showToast("Date of birth cannot be in the future.", true);
            return;
          }
        }
      }

      if (!email) {
        showToast("Please enter your email address.", true);
        return;
      }

      const originalHtml = updateProfileBtn.innerHTML;
      updateProfileBtn.disabled = true;
      updateProfileBtn.style.opacity = "0.85";
      updateProfileBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="animation: spin 0.8s linear infinite;">
          <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)"></circle>
          <path d="M12 2a10 10 0 0 1 10 10" stroke="#ffffff"></path>
        </svg>
        <span>Updating...</span>
      `;

      try {
        const response = await fetch("api/profile.php", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            action: "update_profile",
            fullName: fullName,
            email: email,
            phone: phone,
            dob: dob,
            gender: gender,
          }),
        });

        const result = await response.json();

        updateProfileBtn.disabled = false;
        updateProfileBtn.style.opacity = "1";
        updateProfileBtn.innerHTML = originalHtml;

        if (response.ok && result.success) {
          if (result.user) {
            try {
              localStorage.setItem("ocayur_user", JSON.stringify(result.user));
            } catch (e) {}
          }
          if (result.patient) {
            try {
              localStorage.setItem(
                "ocayur_patient",
                JSON.stringify(result.patient),
              );
            } catch (e) {}
          }

          const headerUserName = document.getElementById("userName");
          if (headerUserName) headerUserName.textContent = fullName;
          const greetingEl = document.getElementById("userGreeting");
          if (greetingEl) greetingEl.textContent = `Good Morning ${fullName}!`;

          showToast(result.message || "Profile updated successfully!");
        } else {
          showToast(result.message || "Failed to update profile.", true);
        }
      } catch (err) {
        console.error("Update profile network error:", err);
        updateProfileBtn.disabled = false;
        updateProfileBtn.style.opacity = "1";
        updateProfileBtn.innerHTML = originalHtml;
        showToast(
          "Network error while updating profile. Please try again.",
          true,
        );
      }
    });
  }

  // Password Visibility Toggle Handler for Profile Form
  const setupProfilePasswordToggle = (toggleBtnId, inputId) => {
    const toggleBtn = document.getElementById(toggleBtnId);
    const input = document.getElementById(inputId);
    if (!toggleBtn || !input) return;

    toggleBtn.addEventListener("click", () => {
      const isPassword = input.type === "password";
      input.type = isPassword ? "text" : "password";

      const eyeOffIcon = toggleBtn.querySelector(".eye-off-icon");
      const eyeOnIcon = toggleBtn.querySelector(".eye-on-icon");

      if (eyeOffIcon && eyeOnIcon) {
        eyeOffIcon.style.display = isPassword ? "none" : "block";
        eyeOnIcon.style.display = isPassword ? "block" : "none";
      }
    });
  };

  setupProfilePasswordToggle("oldPasswordToggleBtn", "oldPassword");
  setupProfilePasswordToggle("newPasswordToggleBtn", "newPassword");
  setupProfilePasswordToggle("confirmPasswordToggleBtn", "confirmPassword");

  // Change Password Form Submission
  const changePasswordForm = document.getElementById("changePasswordForm");
  const changePasswordBtn = document.getElementById("changePasswordBtn");

  const mainNewPasswordInput = document.getElementById("newPassword");
  const mainConfirmPasswordInput = document.getElementById("confirmPassword");
  const mainStrengthBarFill = document.getElementById("strengthBarFill");
  const mainStrengthLabel = document.getElementById("strengthLabel");
  const mainNewPasswordError = document.getElementById("newPasswordError");
  const mainConfirmPasswordError = document.getElementById(
    "confirmPasswordError",
  );

  // Live Password Strength Meter
  if (mainNewPasswordInput && mainStrengthBarFill && mainStrengthLabel) {
    mainNewPasswordInput.addEventListener("input", () => {
      const val = mainNewPasswordInput.value;
      if (mainNewPasswordError) {
        mainNewPasswordError.textContent = "";
        mainNewPasswordError.classList.remove("visible");
      }
      mainNewPasswordInput.classList.remove("input-error");

      if (!val) {
        mainStrengthBarFill.style.width = "0%";
        mainStrengthBarFill.style.backgroundColor = "#e2e8f0";
        mainStrengthLabel.textContent = "Enter password";
        mainStrengthLabel.style.color = "#94a3b8";
        return;
      }

      const hasLetter = /[a-zA-Z]/.test(val);
      const hasNumber = /[0-9]/.test(val);
      const hasSpecial = /[^A-Za-z0-9]/.test(val);

      let score = 0;
      if (val.length >= 8) score += 1;
      if (val.length >= 12) score += 1;
      if (/[A-Z]/.test(val) && /[a-z]/.test(val)) score += 1;
      if (hasNumber) score += 1;
      if (hasSpecial) score += 1;

      if (val.length < 8) {
        mainStrengthBarFill.style.width = "25%";
        mainStrengthBarFill.style.backgroundColor = "#ef4444";
        mainStrengthLabel.textContent = "Too short";
        mainStrengthLabel.style.color = "#ef4444";
      } else if (!hasLetter || !hasNumber || !hasSpecial) {
        mainStrengthBarFill.style.width = "50%";
        mainStrengthBarFill.style.backgroundColor = "#f59e0b";
        mainStrengthLabel.textContent = "Weak";
        mainStrengthLabel.style.color = "#f59e0b";
      } else if (score <= 4) {
        mainStrengthBarFill.style.width = "75%";
        mainStrengthBarFill.style.backgroundColor = "#3b82f6";
        mainStrengthLabel.textContent = "Good";
        mainStrengthLabel.style.color = "#3b82f6";
      } else {
        mainStrengthBarFill.style.width = "100%";
        mainStrengthBarFill.style.backgroundColor = "#10b981";
        mainStrengthLabel.textContent = "Strong";
        mainStrengthLabel.style.color = "#10b981";
      }
    });
  }

  if (mainConfirmPasswordInput) {
    mainConfirmPasswordInput.addEventListener("input", () => {
      if (mainConfirmPasswordError) {
        mainConfirmPasswordError.textContent = "";
        mainConfirmPasswordError.classList.remove("visible");
      }
      mainConfirmPasswordInput.classList.remove("input-error");
    });
  }

  if (changePasswordForm && changePasswordBtn) {
    changePasswordForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const oldPassword = document.getElementById("oldPassword")?.value;
      const newPassword =
        mainNewPasswordInput?.value ||
        document.getElementById("newPassword")?.value;
      const confirmPassword =
        mainConfirmPasswordInput?.value ||
        document.getElementById("confirmPassword")?.value;
      const phoneInputVal =
        document.getElementById("profilePhone")?.value.trim() || "";

      if (mainNewPasswordError) {
        mainNewPasswordError.textContent = "";
        mainNewPasswordError.classList.remove("visible");
      }
      if (mainConfirmPasswordError) {
        mainConfirmPasswordError.textContent = "";
        mainConfirmPasswordError.classList.remove("visible");
      }
      mainNewPasswordInput?.classList.remove("input-error");
      mainConfirmPasswordInput?.classList.remove("input-error");

      if (!oldPassword) {
        showToast("Please enter your current password.", true);
        document.getElementById("oldPassword")?.focus();
        return;
      }

      if (!newPassword) {
        showToast("Please enter a new password.", true);
        if (mainNewPasswordError) {
          mainNewPasswordError.textContent = "Please enter a new password.";
          mainNewPasswordError.classList.add("visible");
        }
        mainNewPasswordInput?.classList.add("input-error");
        mainNewPasswordInput?.focus();
        return;
      }

      const hasLetter = /[a-zA-Z]/.test(newPassword);
      const hasNumber = /[0-9]/.test(newPassword);
      const hasSpecial = /[^a-zA-Z0-9]/.test(newPassword);

      if (newPassword.length < 8 || !hasLetter || !hasNumber || !hasSpecial) {
        const errorMsg =
          "The password should contain special characters, numbers, and alphabets, and it must be at least 8 digits long.";
        showToast(errorMsg, true);
        if (mainNewPasswordError) {
          mainNewPasswordError.textContent = errorMsg;
          mainNewPasswordError.classList.add("visible");
        }
        mainNewPasswordInput?.classList.add("input-error");
        mainNewPasswordInput?.focus();
        return;
      }

      if (newPassword !== confirmPassword) {
        showToast("New password and confirm password do not match.", true);
        if (mainConfirmPasswordError) {
          mainConfirmPasswordError.textContent =
            "New password and confirm password do not match.";
          mainConfirmPasswordError.classList.add("visible");
        }
        mainConfirmPasswordInput?.classList.add("input-error");
        mainConfirmPasswordInput?.focus();
        return;
      }

      const originalHtml = changePasswordBtn.innerHTML;
      changePasswordBtn.disabled = true;
      changePasswordBtn.style.opacity = "0.85";
      changePasswordBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="animation: spin 0.8s linear infinite;">
          <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)"></circle>
          <path d="M12 2a10 10 0 0 1 10 10" stroke="#ffffff"></path>
        </svg>
        <span>Updating...</span>
      `;

      try {
        const response = await fetch("api/profile.php", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            action: "change_password",
            oldPassword: oldPassword,
            newPassword: newPassword,
            confirmPassword: confirmPassword,
            phone: phoneInputVal,
          }),
        });

        const result = await response.json();

        changePasswordBtn.disabled = false;
        changePasswordBtn.style.opacity = "1";
        changePasswordBtn.innerHTML = originalHtml;

        if (response.ok && result.success) {
          changePasswordForm.reset();
          if (mainStrengthBarFill) {
            mainStrengthBarFill.style.width = "0%";
            mainStrengthBarFill.style.backgroundColor = "#e2e8f0";
          }
          if (mainStrengthLabel) {
            mainStrengthLabel.textContent = "Enter password";
            mainStrengthLabel.style.color = "#94a3b8";
          }
          showToast(result.message || "Password changed successfully!");
        } else {
          showToast(result.message || "Failed to change password.", true);
        }
      } catch (err) {
        console.error("Password change network error:", err);
        changePasswordBtn.disabled = false;
        changePasswordBtn.style.opacity = "1";
        changePasswordBtn.innerHTML = originalHtml;
        showToast(
          "Network error while changing password. Please try again.",
          true,
        );
      }
    });
  }

  // Action links feedback for footer links
  const demoLinks = ["termsLink"];
  demoLinks.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("click", (e) => {
        if (el.getAttribute("href").startsWith("#")) {
          e.preventDefault();
          showToast(`Navigating to ${el.textContent.trim()}...`);
        }
      });
    }
  });

  // ==========================================
  // Forgot Password & OTP Flow (Patient Portal)
  // ==========================================
  const fpModal = document.getElementById("forgotPasswordModal");
  const fpCloseBtn = document.getElementById("fpCloseBtn");
  const fpStepRequest = document.getElementById("fpStepRequest");
  const fpStepVerify = document.getElementById("fpStepVerify");
  const fpStepSuccess = document.getElementById("fpStepSuccess");

  const fpRequestForm = document.getElementById("fpRequestForm");
  const fpIdentifier = document.getElementById("fpIdentifier");
  const fpSendOtpBtn = document.getElementById("fpSendOtpBtn");
  const fpRequestError = document.getElementById("fpRequestError");
  const fpRequestErrorText = document.getElementById("fpRequestErrorText");

  const fpResetForm = document.getElementById("fpResetForm");
  const fpMaskedEmailText = document.getElementById("fpMaskedEmailText");
  const fpOtpCode = document.getElementById("fpOtpCode");
  const fpNewPassword = document.getElementById("fpNewPassword");
  const fpConfirmPassword = document.getElementById("fpConfirmPassword");
  const fpSubmitResetBtn = document.getElementById("fpSubmitResetBtn");
  const fpResetError = document.getElementById("fpResetError");
  const fpResetErrorText = document.getElementById("fpResetErrorText");

  const fpToggleNewPw = document.getElementById("fpToggleNewPw");
  const fpToggleConfirmPw = document.getElementById("fpToggleConfirmPw");
  const fpBackToRequestBtn = document.getElementById("fpBackToRequestBtn");
  const fpResendOtpBtn = document.getElementById("fpResendOtpBtn");
  const fpResendCountdown = document.getElementById("fpResendCountdown");
  const fpTimerCount = document.getElementById("fpTimerCount");
  const fpSuccessDoneBtn = document.getElementById("fpSuccessDoneBtn");

  const patientForgotLink = document.getElementById("forgotPasswordLink");
  const phoneLoginInput =
    document.getElementById("phoneNumber") || document.getElementById("phone");

  let fpCurrentEmail = "";
  let fpCurrentIdentifier = "";
  let fpResendInterval = null;

  const openFpModal = (e) => {
    if (e) e.preventDefault();
    if (phoneLoginInput && phoneLoginInput.value.trim() && fpIdentifier) {
      fpIdentifier.value = phoneLoginInput.value.trim();
    }
    showFpStep("request");
    hideFpError(fpRequestError);
    hideFpError(fpResetError);
    if (fpModal) {
      fpModal.classList.add("open");
      setTimeout(() => {
        if (fpIdentifier) fpIdentifier.focus();
      }, 150);
    }
  };

  const closeFpModal = () => {
    if (fpModal) fpModal.classList.remove("open");
    clearInterval(fpResendInterval);
  };

  const showFpStep = (step) => {
    if (fpStepRequest)
      fpStepRequest.style.display = step === "request" ? "block" : "none";
    if (fpStepVerify)
      fpStepVerify.style.display = step === "verify" ? "block" : "none";
    if (fpStepSuccess)
      fpStepSuccess.style.display = step === "success" ? "block" : "none";
  };

  const showFpError = (boxEl, textEl, message) => {
    if (textEl) textEl.textContent = message;
    if (boxEl) boxEl.classList.add("show");
  };

  const hideFpError = (boxEl) => {
    if (boxEl) boxEl.classList.remove("show");
  };

  const startResendTimer = (seconds = 60) => {
    clearInterval(fpResendInterval);
    if (!fpResendOtpBtn || !fpResendCountdown || !fpTimerCount) return;

    fpResendOtpBtn.style.display = "none";
    fpResendCountdown.style.display = "inline";
    fpTimerCount.textContent = seconds;

    let remaining = seconds;
    fpResendInterval = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(fpResendInterval);
        fpResendCountdown.style.display = "none";
        fpResendOtpBtn.style.display = "inline";
      } else {
        fpTimerCount.textContent = remaining;
      }
    }, 1000);
  };

  if (patientForgotLink) {
    patientForgotLink.addEventListener("click", openFpModal);
  }
  if (fpCloseBtn) {
    fpCloseBtn.addEventListener("click", closeFpModal);
  }
  if (fpModal) {
    fpModal.addEventListener("click", (e) => {
      if (e.target === fpModal) closeFpModal();
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && fpModal && fpModal.classList.contains("open")) {
      closeFpModal();
    }
  });

  // Password visibility toggle
  const setupToggle = (btn, input) => {
    if (!btn || !input) return;
    btn.addEventListener("click", () => {
      const isPass = input.type === "password";
      input.type = isPass ? "text" : "password";
      btn.style.color = isPass ? "#723f1e" : "#8e877b";
    });
  };
  setupToggle(fpToggleNewPw, fpNewPassword);
  setupToggle(fpToggleConfirmPw, fpConfirmPassword);

  // Step 1: Request OTP
  if (fpRequestForm) {
    fpRequestForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      hideFpError(fpRequestError);
      const identifierVal = fpIdentifier.value.trim();
      if (!identifierVal) {
        showFpError(
          fpRequestError,
          fpRequestErrorText,
          "Please enter your registered phone number or email.",
        );
        return;
      }

      fpCurrentIdentifier = identifierVal;
      const btnTextEl = fpSendOtpBtn.querySelector(".btn-text");
      const btnSpinnerEl = fpSendOtpBtn.querySelector(".btn-spinner");
      if (btnTextEl) btnTextEl.textContent = "Sending OTP...";
      if (btnSpinnerEl) btnSpinnerEl.classList.remove("hidden");
      fpSendOtpBtn.disabled = true;

      try {
        const res = await fetch("api/forgot_password.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "send_otp",
            identifier: identifierVal,
          }),
        });
        const data = await res
          .json()
          .catch(() => ({ success: false, message: "Server response error." }));

        if (res.ok && data.success) {
          fpCurrentEmail = data.email || "";
          if (fpMaskedEmailText)
            fpMaskedEmailText.textContent = data.masked_email || fpCurrentEmail;
          showFpStep("verify");
          startResendTimer(60);
          showToast("OTP sent successfully to your registered email.");
          if (fpOtpCode) {
            fpOtpCode.value = "";
            setTimeout(() => fpOtpCode.focus(), 150);
          }
        } else {
          // If patient doesn't have an email or has a flawed email, show error to contact admin
          showFpError(
            fpRequestError,
            fpRequestErrorText,
            data.message || "Unable to send OTP. Please try again.",
          );
        }
      } catch (err) {
        showFpError(
          fpRequestError,
          fpRequestErrorText,
          "Network error. Please check your connection and try again.",
        );
      } finally {
        if (btnTextEl) btnTextEl.textContent = "Send Verification Code";
        if (btnSpinnerEl) btnSpinnerEl.classList.add("hidden");
        fpSendOtpBtn.disabled = false;
      }
    });
  }

  // Resend OTP
  if (fpResendOtpBtn) {
    fpResendOtpBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      if (!fpCurrentIdentifier) return;
      hideFpError(fpResetError);
      fpResendOtpBtn.textContent = "Sending...";

      try {
        const res = await fetch("api/forgot_password.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "send_otp",
            identifier: fpCurrentIdentifier,
          }),
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data && data.success) {
          showToast("A new OTP code has been sent to your email.");
          startResendTimer(60);
        } else {
          showFpError(
            fpResetError,
            fpResetErrorText,
            (data && data.message) || "Failed to resend OTP.",
          );
        }
      } catch (err) {
        showFpError(
          fpResetError,
          fpResetErrorText,
          "Network error while resending OTP.",
        );
      } finally {
        fpResendOtpBtn.textContent = "Resend code";
      }
    });
  }

  if (fpBackToRequestBtn) {
    fpBackToRequestBtn.addEventListener("click", (e) => {
      e.preventDefault();
      showFpStep("request");
      hideFpError(fpResetError);
    });
  }

  // Step 2: Reset Password Form
  if (fpResetForm) {
    fpResetForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      hideFpError(fpResetError);

      const otp = fpOtpCode.value.trim();
      const newPw = fpNewPassword.value.trim();
      const confirmPw = fpConfirmPassword.value.trim();

      if (!otp || otp.length !== 6) {
        showFpError(
          fpResetError,
          fpResetErrorText,
          "Please enter the 6-digit OTP code sent to your email.",
        );
        return;
      }

      if (newPw.length < 6) {
        showFpError(
          fpResetError,
          fpResetErrorText,
          "Password must be at least 6 characters long.",
        );
        return;
      }

      if (newPw !== confirmPw) {
        showFpError(
          fpResetError,
          fpResetErrorText,
          "Passwords do not match. Please re-enter.",
        );
        return;
      }

      const btnTextEl = fpSubmitResetBtn.querySelector(".btn-text");
      const btnSpinnerEl = fpSubmitResetBtn.querySelector(".btn-spinner");
      if (btnTextEl) btnTextEl.textContent = "Resetting Password...";
      if (btnSpinnerEl) btnSpinnerEl.classList.remove("hidden");
      fpSubmitResetBtn.disabled = true;

      try {
        const res = await fetch("api/forgot_password.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "reset_password",
            email: fpCurrentEmail,
            otp: otp,
            new_password: newPw,
            confirm_password: confirmPw,
          }),
        });
        const data = await res
          .json()
          .catch(() => ({ success: false, message: "Server response error." }));

        if (res.ok && data.success) {
          showFpStep("success");
          showToast("Password reset successfully!");
        } else {
          showFpError(
            fpResetError,
            fpResetErrorText,
            data.message || "Unable to reset password. Please check the OTP.",
          );
        }
      } catch (err) {
        showFpError(
          fpResetError,
          fpResetErrorText,
          "Network error. Please try again.",
        );
      } finally {
        if (btnTextEl) btnTextEl.textContent = "Reset Password";
        if (btnSpinnerEl) btnSpinnerEl.classList.add("hidden");
        fpSubmitResetBtn.disabled = false;
      }
    });
  }

  if (fpSuccessDoneBtn) {
    fpSuccessDoneBtn.addEventListener("click", () => {
      closeFpModal();
      const pwInput =
        document.getElementById("loginPassword") ||
        document.getElementById("password");
      if (pwInput) {
        pwInput.value = "";
        pwInput.focus();
      }
    });
  }
});
