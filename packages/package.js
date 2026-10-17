/**
 * Ocayur Patient Portal - Packages & Direct Checkout Engine
 * Dynamic Database Backend Integration with PHP & JS
 */

document.addEventListener('DOMContentLoaded', () => {
  // Page Loader Overlay Logic
  const pageLoader = document.getElementById('pageLoader');
  const hidePageLoader = () => {
    if (!pageLoader) return;
    pageLoader.classList.add('hidden');
    setTimeout(() => {
      pageLoader.style.display = 'none';
    }, 450);
  };
  // Fallback safety timeout for page loader
  setTimeout(hidePageLoader, 2500);

  // Navigation & Elements
  const mobileMenuToggle = document.getElementById('mobileMenuToggle');
  const dashboardSidebar = document.getElementById('dashboardSidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMsg');

  // Main Views & Category Navigation
  const packagesTabsBar = document.getElementById('packagesTabsBar');
  const tabAllPackages = document.getElementById('tabAllPackages');
  const tabRecommendedPackages = document.getElementById('tabRecommendedPackages');
  const tabMyPackages = document.getElementById('tabMyPackages');
  const badgeAllCount = document.getElementById('badgeAllCount');
  const badgeRecommendedCount = document.getElementById('badgeRecommendedCount');
  const badgeMyCount = document.getElementById('badgeMyCount');

  const packagesListSection = document.getElementById('packagesListSection');
  const packageDetailSection = document.getElementById('packageDetailSection');
  const backToPackagesBtn = document.getElementById('backToPackagesBtn');
  const navPackages = document.getElementById('navPackages');
  const bookConsultationBtn = document.getElementById('bookConsultationBtn');

  // Detail View Elements
  const detailPkgImg = document.getElementById('detailPkgImg');
  const detailPkgTitle = document.getElementById('detailPkgTitle');
  const detailPkgSubtitle = document.getElementById('detailPkgSubtitle');
  const detailPkgPrice = document.getElementById('detailPkgPrice');
  const detailPkgDuration = document.getElementById('detailPkgDuration');
  const detailPkgBatch = document.getElementById('detailPkgBatch');
  const detailPkgDescription = document.getElementById('detailPkgDescription');
  const doctorAvatarText = document.getElementById('doctorAvatarText');
  const doctorName = document.getElementById('doctorName');
  const doctorRole = document.getElementById('doctorRole');
  const doctorDescription = document.getElementById('doctorDescription');

  // Memory store for DB packages and Categories
  let categoriesData = {
    all: [],
    recommended: [],
    my: []
  };
  let currentActiveCategory = 'all';
  let loadedPackages = [];
  let currentSelectedPackage = null;

  // Helper: Toast Message
  const showToast = (message, isError = false) => {
    if (!toast || !toastMsg) return;
    toastMsg.textContent = message;
    toast.style.background = isError ? '#ef4444' : '#1e293b';
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3200);
  };

  const getPackageImage = (pkg) => {
    const image = String(pkg.image_url || pkg.image || '').trim();

    if (!image) {
      return '../assets/gut-healing-pkg.jpg';
    }

    // External URL or embedded image
    if (/^(https?:\/\/|data:image\/|blob:)/i.test(image)) {
      return image;
    }

    // Already a relative path
    if (image.startsWith('../') || image.startsWith('./')) {
      return image;
    }

    // Remove leading slash and build a relative path
    return `../${image.replace(/^\/+/, '')}`;
  };

  // Mobile Menu Drawer Toggle
  const toggleMobileSidebar = (open) => {
    if (!dashboardSidebar || !sidebarOverlay) return;
    const shouldOpen = open !== undefined ? open : !dashboardSidebar.classList.contains('open');
    if (shouldOpen) {
      dashboardSidebar.classList.add('open');
      sidebarOverlay.classList.add('active');
      document.body.style.overflow = 'hidden';
    } else {
      dashboardSidebar.classList.remove('open');
      sidebarOverlay.classList.remove('active');
      document.body.style.overflow = '';
    }
  };

  if (mobileMenuToggle) {
    mobileMenuToggle.addEventListener('click', () => toggleMobileSidebar());
  }

  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', () => {
      toggleMobileSidebar(false);
    });
  }

  // Synchronize authenticated user header details
  const applyUserHeader = (user, patient) => {
    const fullName = patient?.full_name || user?.full_name;
    const patientId = patient?.patient_id || ('P00' + (user?.id || 1));

    if (fullName) {
      const userName = document.getElementById('userName');
      if (userName) userName.textContent = fullName;
      const userGreeting = document.getElementById('userGreeting');
      if (userGreeting) userGreeting.textContent = `Good Morning ${fullName}!`;
      const upc = document.getElementById('userProfileCard');
      if (upc) upc.setAttribute('aria-label', `User profile: ${fullName}, Patient ID ${patientId}`);
      const mua = document.querySelector('.mobile-user-avatar');
      if (mua) mua.setAttribute('title', `${fullName} (${patientId})`);
    }
    if (patientId) {
      const patientIdEl = document.getElementById('patientId');
      if (patientIdEl) patientIdEl.textContent = patientId;
    }
  };

  let cachedPhone = '';
  let cachedPatientId = '';
  try {
    const storedUser = JSON.parse((localStorage.getItem('ocayur_user') || localStorage.getItem('panchved_user')) || 'null');
    const storedPatient = JSON.parse((localStorage.getItem('ocayur_patient') || localStorage.getItem('panchved_patient')) || 'null');
    if (storedUser || storedPatient) {
      applyUserHeader(storedUser, storedPatient);
      cachedPhone = storedPatient?.phone_number || storedUser?.phone_number || '';
      cachedPatientId = storedPatient?.patient_id || '';
    }
  } catch (err) { }

  // Fetch header profile from database
  const syncHeaderFromDB = async () => {
    try {
      const params = new URLSearchParams();
      if (cachedPhone) params.append('phone', cachedPhone);
      if (cachedPatientId) params.append('patient_id', cachedPatientId);
      const res = await fetch('../api/profile.php' + (params.toString() ? `?${params.toString()}` : ''));
      if (res.ok) {
        const data = await res.json();
        if (data.success && (data.patient || data.user)) {
          applyUserHeader(data.user, data.patient);
          const newPhone = data.patient?.phone_number || data.user?.phone_number || '';
          const newPid = data.patient?.patient_id || '';
          if (!cachedPhone && newPhone) {
            cachedPhone = newPhone;
            cachedPatientId = newPid;
            fetchPackagesCategoriesFromDB();
          }
        }
      }
    } catch (e) { }
  };
  syncHeaderFromDB();

  // Logout Modal Handlers
  const logoutBtn = document.getElementById('logoutBtn');
  const logoutModal = document.getElementById('logoutModal');
  const closeLogoutModalBtn = document.getElementById('closeLogoutModalBtn');
  const cancelLogoutBtn = document.getElementById('cancelLogoutBtn');
  const confirmLogoutBtn = document.getElementById('confirmLogoutBtn');

  const openLogoutModal = () => {
    if (logoutModal) {
      logoutModal.classList.add('active');
      logoutModal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }
  };

  const closeLogoutModal = () => {
    if (logoutModal) {
      logoutModal.classList.remove('active');
      logoutModal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }
  };

  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openLogoutModal();
    });
  }

  if (closeLogoutModalBtn) closeLogoutModalBtn.addEventListener('click', closeLogoutModal);
  if (cancelLogoutBtn) cancelLogoutBtn.addEventListener('click', closeLogoutModal);

  if (logoutModal) {
    logoutModal.addEventListener('click', (e) => {
      if (e.target === logoutModal) closeLogoutModal();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && logoutModal && logoutModal.classList.contains('active')) {
      closeLogoutModal();
    }
  });

  if (confirmLogoutBtn) {
    confirmLogoutBtn.addEventListener('click', async () => {
      confirmLogoutBtn.disabled = true;
      confirmLogoutBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation: spin 0.8s linear infinite; margin-right: 6px;">
          <circle cx="12" cy="12" r="10" stroke-opacity="0.25" stroke="currentColor"></circle>
          <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor"></path>
        </svg>
        <span>Logging out...</span>
      `;
      try { await fetch('../api/logout.php', { method: 'POST' }); } catch (err) { }
      try {
        localStorage.removeItem('ocayur_user'); localStorage.removeItem('panchved_user');
        localStorage.removeItem('ocayur_patient'); localStorage.removeItem('panchved_patient');
        localStorage.removeItem('ocayur_prakruti_result'); localStorage.removeItem('panchved_prakruti_result');
        localStorage.removeItem('ocayur_booked_packages');
        localStorage.removeItem('ocayur_consultation_booking');
        localStorage.removeItem('ocayur_checkout_type');
      } catch (e) { }
      showToast('Logged out successfully.');
      setTimeout(() => { window.location.href = '../index.html'; }, 350);
    });
  }

  // 1. Switcher: Packages List (Screen 1) vs Package Details (Screen 2)
  const populatePackageDetailsView = (pkg) => {
    if (!pkg) return;
    currentSelectedPackage = pkg;

    if (detailPkgTitle) detailPkgTitle.textContent = pkg.package_name || '';
    if (detailPkgSubtitle) detailPkgSubtitle.textContent = pkg.short_description || pkg.overview || '';
    if (detailPkgPrice) detailPkgPrice.textContent = pkg.price_formatted || (`₹${pkg.price || '7,999'}`);
    if (detailPkgDuration) detailPkgDuration.textContent = pkg.duration || '3 Months';
    if (detailPkgBatch) detailPkgBatch.textContent = pkg.batch_text || `${pkg.enrollments || 0} Patient Batch`;

    // Dynamic About the Package Overview
    if (detailPkgDescription) {
      detailPkgDescription.textContent = pkg.overview || pkg.short_description || 'A personalized, multi-dimensional Ayurvedic and rehabilitation wellness protocol tailored to your dosha.';
    }

    if (detailPkgImg) {
      detailPkgImg.src = getPackageImage(pkg);
      detailPkgImg.alt =
        `${pkg.package_name || 'Package'} - Ocayur Ayurveda Lifestyle`;

      detailPkgImg.onerror = () => {
        detailPkgImg.onerror = null;
        detailPkgImg.style.display = 'none';
      };

      detailPkgImg.style.display = 'block';
    }

    // Dynamic Doctor details from database schema
    const doc = pkg.doctor || {};
    if (doctorName) doctorName.textContent = doc.name || pkg.assigned_doctor || 'Dr. Nidhi Jha';
    if (doctorRole) doctorRole.textContent = doc.role || doc.expertise || 'Ayurveda Physician';
    if (doctorDescription) {
      doctorDescription.textContent = doc.description || (doc.name ? `${doc.name} is a dedicated practitioner committed to patient-centric holistic healing and preventive lifestyle care.` : 'Dedicated senior Ayurvedic physician committed to patient-centric holistic healing and preventive lifestyle care.');
    }
    if (doctorAvatarText) {
      doctorAvatarText.textContent = doc.initials || 'DR';
    }

    // Check if the current package is already booked
    if (bookConsultationBtn) {
      const isAlreadyBooked = categoriesData.my && categoriesData.my.some(bp => bp.package_name && bp.package_name.toLowerCase() === (pkg.package_name || '').toLowerCase());
      if (isAlreadyBooked) {
        bookConsultationBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>Enrolled (Active Package)</span>
        `;
        bookConsultationBtn.style.backgroundColor = '#15803d';
      } else {
        const priceLabel = pkg.price_formatted || (pkg.price ? `₹${parseFloat(pkg.price).toLocaleString('en-IN')}` : '');
        bookConsultationBtn.innerHTML = `<span>Book Package${priceLabel ? ` (${priceLabel})` : ''}</span>`;
        bookConsultationBtn.style.backgroundColor = '';
      }
    }
  };

  const showPackageDetail = async (pkgOrCard) => {
    let pkgData = null;
    let targetId = null;
    let targetPkgCode = null;
    let targetName = null;

    if (pkgOrCard && typeof pkgOrCard === 'object' && pkgOrCard.package_name) {
      pkgData = pkgOrCard;
      targetId = pkgData.id || null;
      targetPkgCode = pkgData.package_id || null;
      targetName = pkgData.package_name || null;
    } else if (pkgOrCard instanceof HTMLElement) {
      targetId = pkgOrCard.getAttribute('data-id') || null;
      targetPkgCode = pkgOrCard.getAttribute('data-package-id') || null;
      targetName = pkgOrCard.getAttribute('data-package') || pkgOrCard.querySelector('.package-title')?.textContent.trim() || null;

      if (targetId || targetPkgCode || targetName) {
        pkgData = loadedPackages.find(p =>
          (targetId && p.id == targetId) ||
          (targetPkgCode && p.package_id === targetPkgCode) ||
          (targetName && p.package_name && p.package_name.toLowerCase() === targetName.toLowerCase())
        );
      }
    } else if (typeof pkgOrCard === 'number' || typeof pkgOrCard === 'string') {
      targetId = pkgOrCard;
      pkgData = loadedPackages.find(p => p.id == targetId || p.package_id === targetId);
    }

    // Immediate preview using loaded package data
    if (pkgData) {
      populatePackageDetailsView(pkgData);
    }

    // Fetch dynamic package & doctor details fresh from SQL database using PHP
    let queryParam = '';
    if (targetId) {
      queryParam = `id=${encodeURIComponent(targetId)}`;
    } else if (targetPkgCode) {
      queryParam = `package_id=${encodeURIComponent(targetPkgCode)}`;
    } else if (targetName) {
      queryParam = `name=${encodeURIComponent(targetName)}`;
    }

    if (queryParam) {
      try {
        const res = await fetch(`../api/packages.php?action=details&${queryParam}`);
        if (res.ok) {
          const resJson = await res.json();
          if (resJson.success && resJson.package) {
            pkgData = resJson.package;
            populatePackageDetailsView(pkgData);
          }
        }
      } catch (err) {
        console.warn('Notice: Error fetching dynamic package details from DB:', err);
      }
    }

    // If still not populated, fallback gracefully
    if (!pkgData && pkgOrCard instanceof HTMLElement) {
      const cardTitle = pkgOrCard.querySelector('.package-title')?.textContent.trim() || targetName || 'Health Package';
      const cardSubtitle = pkgOrCard.querySelector('.package-subtitle')?.textContent.trim() || '';
      const cardPrice = pkgOrCard.querySelector('.package-meta-item strong')?.textContent.trim() || '₹7,999';
      const numCardPrice = parseFloat(cardPrice.replace(/[^0-9.]/g, '')) || 7999;
      pkgData = {
        id: targetId || 1,
        package_id: targetPkgCode || 'PKG-001',
        package_name: cardTitle,
        short_description: cardSubtitle,
        price_formatted: cardPrice,
        price: numCardPrice,
        duration: '3 Months',
        batch_text: '18 Patient Batch',
        overview: cardSubtitle || 'A personalized, multi-dimensional Ayurvedic and rehabilitation wellness protocol tailored to your dosha.',
        image_url: '../assets/gut-healing-pkg.jpg',
        doctor: {
          name: 'Dr. Nidhi Jha',
          role: 'Ayurveda Physician',
          initials: 'NJ',
          description: 'Dr. Nidhi Jha is a senior Ayurveda Physician dedicated to holistic patient-centric healing and preventive lifestyle care.'
        }
      };
      populatePackageDetailsView(pkgData);
    }

    if (packagesTabsBar) packagesTabsBar.style.display = 'none';
    if (packagesListSection) packagesListSection.style.display = 'none';
    if (packageDetailSection) {
      packageDetailSection.style.display = 'flex';
      packageDetailSection.style.animation = 'none';
      void packageDetailSection.offsetWidth;
      packageDetailSection.style.animation = 'fadeInCard 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards';
    }

    history.replaceState(null, '', '#details');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const showPackagesList = () => {
    if (packageDetailSection) packageDetailSection.style.display = 'none';
    if (packagesTabsBar) packagesTabsBar.style.display = 'flex';
    if (packagesListSection) {
      packagesListSection.style.display = 'grid';
      packagesListSection.style.animation = 'none';
      void packagesListSection.offsetWidth;
      packagesListSection.style.animation = 'fadeInCard 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards';
    }

    history.replaceState(null, '', 'package.html' + (currentActiveCategory && currentActiveCategory !== 'all' ? `#${currentActiveCategory}` : ''));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Helper: Bind Package Card Action Handlers
  const bindPackageCardEvents = () => {
    // 1. "View Details" buttons
    const packageButtons = document.querySelectorAll('.btn-package-action:not(.btn-direct-book-package)');
    packageButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const card = btn.closest('.package-card');
        const pkgId = btn.getAttribute('data-id') || card?.getAttribute('data-id') || btn.getAttribute('data-package-id') || card?.getAttribute('data-package-id');
        const pkgName = btn.getAttribute('data-package') || card?.getAttribute('data-package') || card?.querySelector('.package-title')?.textContent.trim();
        const matched = loadedPackages.find(p => (pkgId && (p.id == pkgId || p.package_id === pkgId)) || (pkgName && p.package_name && p.package_name.toLowerCase() === pkgName.toLowerCase()));
        showPackageDetail(matched || card || btn);
      });
    });

    // 2. Direct "Book Package" buttons on recommended cards
    const bookButtons = document.querySelectorAll('.btn-direct-book-package');
    bookButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const card = btn.closest('.package-card');
        const pkgId = btn.getAttribute('data-id') || card?.getAttribute('data-id') || btn.getAttribute('data-package-id');
        const pkgName = btn.getAttribute('data-package') || card?.getAttribute('data-package') || card?.querySelector('.package-title')?.textContent.trim();
        const matched = loadedPackages.find(p => (pkgId && (p.id == pkgId || p.package_id === pkgId)) || (pkgName && p.package_name && p.package_name.toLowerCase() === pkgName.toLowerCase()));
        if (matched) {
          currentSelectedPackage = matched;
          populatePackageDetailsView(matched);
          if (bookConsultationBtn) {
            bookConsultationBtn.click();
          }
        } else {
          showPackageDetail(card || btn);
        }
      });
    });

    // 3. Card surface click opens details
    const cards = document.querySelectorAll('.package-card');
    cards.forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.btn-package-action') || e.target.closest('a') || e.target.closest('button')) return;
        const pkgId = card.getAttribute('data-id') || card.getAttribute('data-package-id');
        const pkgName = card.getAttribute('data-package') || card.querySelector('.package-title')?.textContent.trim();
        const matched = loadedPackages.find(p => (pkgId && (p.id == pkgId || p.package_id === pkgId)) || (pkgName && p.package_name && p.package_name.toLowerCase() === pkgName.toLowerCase()));
        showPackageDetail(matched || card);
      });
    });
  };

  // Switch Active Category (all, recommended, my)
  const switchCategory = (category) => {
    currentActiveCategory = category;

    if (tabAllPackages) {
      tabAllPackages.classList.toggle('active', category === 'all');
      tabAllPackages.setAttribute('aria-selected', category === 'all' ? 'true' : 'false');
    }
    if (tabRecommendedPackages) {
      tabRecommendedPackages.classList.toggle('active', category === 'recommended');
      tabRecommendedPackages.setAttribute('aria-selected', category === 'recommended' ? 'true' : 'false');
    }
    if (tabMyPackages) {
      tabMyPackages.classList.toggle('active', category === 'my');
      tabMyPackages.setAttribute('aria-selected', category === 'my' ? 'true' : 'false');
    }

    const pageSubtitle = document.getElementById('pageSubtitle');
    if (pageSubtitle) {
      if (category === 'all') pageSubtitle.textContent = 'View and purchase health packages created and added to the portal system.';
      else if (category === 'recommended') pageSubtitle.textContent = 'Packages specifically recommended by doctor for your personal health assessment.';
      else if (category === 'my') pageSubtitle.textContent = 'Health packages booked and enrolled by you.';
    }

    renderCurrentCategory();
  };

  // Render Current Category Packages
  const renderCurrentCategory = () => {
    if (!packagesListSection) return;
    const pkgs = categoriesData[currentActiveCategory] || [];

    if (pkgs.length === 0) {
      if (currentActiveCategory === 'recommended') {
        packagesListSection.innerHTML = `
          <div class="packages-empty-state" role="status">
            <div class="packages-empty-icon-wrap" aria-hidden="true">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path>
              </svg>
            </div>
            <h3 class="packages-empty-title">No Doctor Recommended Packages</h3>
            <p class="packages-empty-desc">Your consulting physician has not recommended any specific health packages yet. Schedule an Ayurvedic consultation to receive personalized health recommendations.</p>
            <a href="../consultation/consultation.html" class="packages-empty-action-btn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
              </svg>
              <span>Book Doctor Consultation</span>
            </a>
          </div>
        `;
      } else if (currentActiveCategory === 'my') {
        packagesListSection.innerHTML = `
          <div class="packages-empty-state" role="status">
            <div class="packages-empty-icon-wrap" aria-hidden="true">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
            </div>
            <h3 class="packages-empty-title">No Packages Booked Yet</h3>
            <p class="packages-empty-desc">You have not booked any health packages yet. Browse all available packages or doctor-recommended packages to begin your wellness journey.</p>
            <button type="button" class="packages-empty-action-btn" id="emptyExploreAllBtn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
              </svg>
              <span>Explore All Packages</span>
            </button>
          </div>
        `;
        document.getElementById('emptyExploreAllBtn')?.addEventListener('click', () => switchCategory('all'));
      } else {
        packagesListSection.innerHTML = `
          <div class="packages-empty-state" role="status">
            <div class="packages-empty-icon-wrap" aria-hidden="true">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
              </svg>
            </div>
            <h3 class="packages-empty-title">No Health Packages Found</h3>
            <p class="packages-empty-desc">There are currently no health packages added to the portal system. Please check back shortly or explore our live workshops and consultations.</p>
            <a href="../courses/courses.html" class="packages-empty-action-btn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="9" cy="21" r="1"></circle>
                <circle cx="20" cy="21" r="1"></circle>
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
              </svg>
              <span>Browse Workshops</span>
            </a>
          </div>
        `;
      }
      return;
    }

    if (currentActiveCategory === 'recommended') {
      // Category 2: Recommended Packages Section
      packagesListSection.innerHTML = pkgs.map(pkg => `
        <article class="package-card recommended-card" id="pkg_${pkg.package_id || pkg.id}" data-package-id="${pkg.package_id || pkg.id}" data-id="${pkg.id}" data-package="${pkg.package_name}">
         
         <div class="package-card-image-wrapper">
  <img
    class="package-card-image"
    src="${getPackageImage(pkg)}"
    alt="${pkg.package_name || 'Health Package'}"
    loading="lazy"
    onerror="this.onerror=null; this.src='../assets/gut-healing-pkg.jpg';"
  />
</div>
        
        <div class="package-header">
            <div class="package-recommend-pill">
              <svg width="13" height="13" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path>
              </svg>
              <span>Recommended by ${pkg.recommended_by_doctor || pkg.doctor?.name || 'Dr. Nidhi Jha'}</span>
            </div>
            <h2 class="package-title">${pkg.package_name}</h2>
            <p class="package-subtitle">${pkg.short_description || pkg.overview || 'Specially recommended for holistic healing.'}</p>
            ${pkg.recommendation_note ? `
              <div class="package-doctor-rec-note">
                <p>"${pkg.recommendation_note}"</p>
              </div>
            ` : ''}
          </div>

          <div class="package-meta-list">
            <div class="package-meta-item">
              <span class="meta-icon" aria-hidden="true">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                </svg>
              </span>
              <span>Starting at <strong>${pkg.price_formatted || ('₹' + pkg.price)}</strong> / month</span>
            </div>
            <div class="package-meta-item">
              <span class="meta-icon" aria-hidden="true">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
              </span>
              <span><strong>${pkg.duration || '3 Months'}</strong></span>
            </div>
            <div class="package-meta-item">
              <span class="meta-icon" aria-hidden="true">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="9" cy="7" r="4"></circle>
                </svg>
              </span>
              <span><strong>${pkg.batch_text || (pkg.enrollments + ' Patient Batch')}</strong></span>
            </div>
          </div>

          <div class="package-card-footer">
            <div class="package-card-actions-group">
              <button type="button" class="btn-package-secondary btn-package-action" data-id="${pkg.id}" data-package-id="${pkg.package_id || pkg.id}" data-package="${pkg.package_name}">
                <span>View Details</span>
              </button>
              <button type="button" class="btn-package-action btn-direct-book-package" data-id="${pkg.id}" data-package-id="${pkg.package_id || pkg.id}" data-package="${pkg.package_name}">
                <span>Book Package</span>
              </button>
            </div>
          </div>
        </article>
      `).join('');
    } else if (currentActiveCategory === 'my') {
      // Category 3: My Packages Section (Booked packages)
      packagesListSection.innerHTML = pkgs.map(pkg => `
        <article class="package-card my-booked-card" id="pkg_${pkg.package_id || pkg.id}" data-package-id="${pkg.package_id || pkg.id}" data-id="${pkg.id}" data-package="${pkg.package_name}">
          
        <div class="package-card-image-wrapper">
  <img
    class="package-card-image"
    src="${getPackageImage(pkg)}"
    alt="${pkg.package_name || 'Health Package'}"
    loading="lazy"
    onerror="this.onerror=null; this.src='../assets/gut-healing-pkg.jpg';"
  />
</div>
        
        <div class="package-header">
            <div class="package-card-top-row">
              <span class="package-booking-meta-badge">${pkg.booking_id || '#PKG-ENROLLED'}</span>
              <span class="package-status-pill status-${(pkg.booking_status || 'active').toLowerCase()}">
                ${pkg.booking_status || 'Active'}
              </span>
            </div>
            <h2 class="package-title">${pkg.package_name}</h2>
            <p class="package-subtitle">${pkg.short_description || pkg.overview || 'Your enrolled health rehabilitation package.'}</p>
          </div>

          <div class="package-meta-list">
            <div class="package-meta-item">
              <span class="meta-icon" aria-hidden="true">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
              </span>
              <span>Booked on <strong>${pkg.booking_date || 'Enrolled'}</strong></span>
            </div>
            <div class="package-meta-item">
              <span class="meta-icon" aria-hidden="true">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
              </span>
              <span>Doctor: <strong>${pkg.booked_doctor || pkg.doctor?.name || 'Dr. Nidhi Jha'}</strong></span>
            </div>
            <div class="package-meta-item">
              <span class="meta-icon" aria-hidden="true">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                </svg>
              </span>
              <span>Plan Duration: <strong>${pkg.duration || '3 Months'}</strong></span>
            </div>
          </div>

          <div class="package-card-footer">
            <div class="package-card-actions-group">
              <button type="button" class="btn-package-secondary btn-package-action" data-id="${pkg.id}" data-package-id="${pkg.package_id || pkg.id}" data-package="${pkg.package_name}">
                <span>View Details</span>
              </button>
              <a href="../consultation/consultation.html" class="btn-package-action" style="text-decoration: none;">
                <span>Consult Doctor</span>
              </a>
            </div>
          </div>
        </article>
      `).join('');
    } else {
      // Category 1: All Packages Section (All health packages added to the portal system)
      packagesListSection.innerHTML = pkgs.map(pkg => `
        <article class="package-card" id="pkg_${pkg.package_id || pkg.id}" data-package-id="${pkg.package_id || pkg.id}" data-id="${pkg.id}" data-package="${pkg.package_name}">
          <div class="package-card-image-wrapper">
  <img
    class="package-card-image"
    src="${getPackageImage(pkg)}"
    alt="${pkg.package_name || 'Health Package'}"
    loading="lazy"
    onerror="this.onerror=null; this.src='../assets/gut-healing-pkg.jpg';"
  />
</div>
        
        <div class="package-header">
            <h2 class="package-title">${pkg.package_name}</h2>
            <p class="package-subtitle">${pkg.short_description || pkg.overview || 'Suitable for holistic health restoration.'}</p>
          </div>

          <div class="package-meta-list">
            <div class="package-meta-item">
              <span class="meta-icon" aria-hidden="true">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                </svg>
              </span>
              <span>Starting at <strong>${pkg.price_formatted || ('₹' + pkg.price)}</strong> / month</span>
            </div>
            <div class="package-meta-item">
              <span class="meta-icon" aria-hidden="true">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
              </span>
              <span><strong>${pkg.duration || '3 Months'}</strong></span>
            </div>
            <div class="package-meta-item">
              <span class="meta-icon" aria-hidden="true">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="9" cy="7" r="4"></circle>
                </svg>
              </span>
              <span><strong>${pkg.batch_text || (pkg.enrollments + ' Patient Batch')}</strong></span>
            </div>
          </div>

          <div class="package-card-footer">
            <div class="package-card-actions-group">
              <button type="button" class="btn-package-secondary btn-package-action" data-id="${pkg.id}" data-package-id="${pkg.package_id || pkg.id}" data-package="${pkg.package_name}">
                <span>View Details</span>
              </button>
              <button type="button" class="btn-package-action btn-direct-book-package" data-id="${pkg.id}" data-package-id="${pkg.package_id || pkg.id}" data-package="${pkg.package_name}">
                <span>Book Package</span>
              </button>
            </div>
          </div>
        </article>
      `).join('');
    }

    bindPackageCardEvents();
  };

  // Fetch Packages Categories from PHP Backend
  const fetchPackagesCategoriesFromDB = async () => {
    try {
      const params = new URLSearchParams();
      params.append('action', 'categories');
      if (cachedPhone) params.append('phone', cachedPhone);
      if (cachedPatientId) params.append('patient_id', cachedPatientId);

      const res = await fetch(`../api/packages.php?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.categories) {
          categoriesData.all = data.categories.all || [];
          categoriesData.recommended = data.categories.recommended || [];
          categoriesData.my = data.categories.my || [];

          // Also sync any locally booked packages that match this patient
          try {
            const localBooked = JSON.parse(localStorage.getItem('ocayur_booked_packages') || '[]');
            if (Array.isArray(localBooked) && localBooked.length > 0) {
              localBooked.forEach(lb => {
                const phoneMatch = !cachedPhone || !lb.patient_phone || lb.patient_phone === cachedPhone;
                if (phoneMatch && lb.package_name) {
                  const alreadyInMy = categoriesData.my.some(p => p.package_name && p.package_name.toLowerCase() === lb.package_name.toLowerCase());
                  if (!alreadyInMy) {
                    const allMatch = categoriesData.all.find(p => p.package_name && p.package_name.toLowerCase() === lb.package_name.toLowerCase());
                    if (allMatch) {
                      categoriesData.my.unshift({
                        ...allMatch,
                        booking_id: lb.booking_id || '#PKG-BOOKED',
                        booking_date: lb.booking_date || 'Today',
                        booking_status: lb.booking_status || 'Active',
                        booked_doctor: lb.doctor_name || allMatch.doctor?.name || 'Dr. Nidhi Jha'
                      });
                    }
                  }
                }
              });
            }
          } catch (e) {}

          loadedPackages = [
            ...categoriesData.all,
            ...categoriesData.recommended,
            ...categoriesData.my
          ];

          if (badgeAllCount) badgeAllCount.textContent = data.counts?.all ?? categoriesData.all.length;
          if (badgeRecommendedCount) badgeRecommendedCount.textContent = data.counts?.recommended ?? categoriesData.recommended.length;
          if (badgeMyCount) badgeMyCount.textContent = categoriesData.my.length;

          renderCurrentCategory();
          return categoriesData;
        }
      }
    } catch (e) {
      console.warn('Notice: Backend fetch packages error:', e);
    } finally {
      hidePageLoader();
    }
    return categoriesData;
  };

  // Back Button
  if (backToPackagesBtn) {
    backToPackagesBtn.addEventListener('click', (e) => {
      e.preventDefault();
      showPackagesList();
    });
  }

  // Sidebar Packages Nav Link resets to packages list
  if (navPackages) {
    navPackages.addEventListener('click', (e) => {
      if (packageDetailSection && packageDetailSection.style.display !== 'none') {
        e.preventDefault();
        showPackagesList();
      }
    });
  }

  // 2. Direct Navigation: 'Book Consultation' -> Directly to Checkout page (Screen 4)
  if (bookConsultationBtn) {
    bookConsultationBtn.addEventListener('click', (e) => {
      e.preventDefault();

      const rawPkgTitle = detailPkgTitle?.textContent.trim() || currentSelectedPackage?.package_name || 'Gut Healing Package';
      const pkgTitle = rawPkgTitle.replace(/\s*-\s*consultation\s*$/i, '').replace(/\s*consultation\s*$/i, '').replace(/\s*-\s*consultation\b/i, '').trim();
      const docName = document.getElementById('doctorName')?.textContent.trim() || currentSelectedPackage?.doctor?.name || 'Dr. Nidhi Jha';
      const docRole = document.getElementById('doctorRole')?.textContent.trim() || currentSelectedPackage?.doctor?.role || 'Ayurveda Physician';

      // Retrieve authenticated patient / user information
      let pName = 'Rahul Sharma';
      let pEmail = 'rahulsharma@gmail.com';
      let pPhone = '9876543210';
      let pId = 'P001';
      try {
        const storedUser = JSON.parse((localStorage.getItem('ocayur_user') || localStorage.getItem('panchved_user')) || 'null');
        const storedPatient = JSON.parse((localStorage.getItem('ocayur_patient') || localStorage.getItem('panchved_patient')) || 'null');
        if (storedPatient || storedUser) {
          pName = storedPatient?.full_name || storedUser?.full_name || pName;
          pEmail = storedPatient?.email || storedUser?.email || pEmail;
          pPhone = storedPatient?.phone_number || storedUser?.phone_number || pPhone;
          pId = storedPatient?.patient_id || (storedUser?.id ? ('P00' + storedUser.id) : pId);
        }
      } catch (err) { }

      const rawPrice = (currentSelectedPackage?.price !== undefined && currentSelectedPackage?.price !== null && !isNaN(parseFloat(currentSelectedPackage.price)))
        ? parseFloat(currentSelectedPackage.price)
        : (detailPkgPrice?.textContent ? parseFloat(detailPkgPrice.textContent.replace(/[^0-9.]/g, '')) : 7999);

      const priceFormatted = currentSelectedPackage?.price_formatted || (rawPrice ? `₹${rawPrice.toLocaleString('en-IN')}` : (detailPkgPrice?.textContent.trim() || '₹7,999'));
      const durationText = detailPkgDuration?.textContent.trim() || currentSelectedPackage?.duration || '3 Months';
      const docInitials = document.getElementById('doctorAvatarText')?.textContent.trim() || currentSelectedPackage?.doctor?.initials || 'DR';

      const feeFormatted = (rawPrice !== undefined && rawPrice !== null && !isNaN(rawPrice) && rawPrice > 0)
        ? `₹${rawPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : (priceFormatted.includes('.00') ? priceFormatted : `${priceFormatted}.00`);

      const bookingData = {
        isPackageCheckout: true,
        packageDbId: currentSelectedPackage?.id || null,
        packageId: currentSelectedPackage?.package_id || 'PKG-001',
        packageTitle: pkgTitle,
        doctorName: docName,
        doctorRole: docRole,
        doctorInitials: docInitials,
        startingPrice: priceFormatted,
        price: rawPrice,
        amount: rawPrice,
        duration: durationText,
        patientName: pName,
        patientEmail: pEmail,
        patientPhone: pPhone,
        patientId: pId,
        date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
        time: '07:00 - 07:45 PM',
        slot: '7:00 PM - 10:00 PM',
        agenda: `Package Enrollment for ${pkgTitle}`,
        fee: feeFormatted
      };

      try {
        localStorage.setItem('ocayur_consultation_booking', JSON.stringify(bookingData));
        localStorage.setItem('ocayur_checkout_type', 'package');
      } catch (err) {
        console.warn('localStorage error', err);
      }

      showToast('Redirecting to Checkout...');
      const targetParam = currentSelectedPackage?.id ? `id=${encodeURIComponent(currentSelectedPackage.id)}` : `package_id=${encodeURIComponent(currentSelectedPackage?.package_id || 'PKG-001')}`;
      setTimeout(() => {
        window.location.href = `checkout.html?${targetParam}`;
      }, 300);
    });
  }

  // Category Navigation Tabs Listeners
  if (tabAllPackages) {
    tabAllPackages.addEventListener('click', (e) => {
      e.preventDefault();
      switchCategory('all');
    });
  }
  if (tabRecommendedPackages) {
    tabRecommendedPackages.addEventListener('click', (e) => {
      e.preventDefault();
      switchCategory('recommended');
    });
  }
  if (tabMyPackages) {
    tabMyPackages.addEventListener('click', (e) => {
      e.preventDefault();
      switchCategory('my');
    });
  }

  // Initial load & URL Hash on Load
  const initPage = async () => {
    bindPackageCardEvents();
    await fetchPackagesCategoriesFromDB();

    if (window.location.hash === '#details' || window.location.hash === '#package-details') {
      const urlParams = new URLSearchParams(window.location.search);
      const pkgId = urlParams.get('id') || urlParams.get('package_id');
      const targetPkg = pkgId ? loadedPackages.find(p => p.id == pkgId || p.package_id === pkgId) : (loadedPackages[0] || null);
      if (targetPkg) {
        showPackageDetail(targetPkg);
      }
    } else if (window.location.hash === '#recommended' || window.location.hash === '#recommended-packages') {
      switchCategory('recommended');
    } else if (window.location.hash === '#my-packages' || window.location.hash === '#my') {
      switchCategory('my');
    }
  };

  initPage();
});
