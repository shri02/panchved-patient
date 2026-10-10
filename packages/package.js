/**
 * Panchved Patient Portal - Packages & Direct Checkout Engine
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

  // Main Views
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

  // Memory store for DB packages
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
    const storedUser = JSON.parse(localStorage.getItem('panchved_user') || 'null');
    const storedPatient = JSON.parse(localStorage.getItem('panchved_patient') || 'null');
    if (storedUser || storedPatient) {
      applyUserHeader(storedUser, storedPatient);
      cachedPhone = storedPatient?.phone_number || storedUser?.phone_number || '';
      cachedPatientId = storedPatient?.patient_id || '';
    }
  } catch (err) {}

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
        }
      }
    } catch (e) {}
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
      try { await fetch('../api/logout.php', { method: 'POST' }); } catch (err) {}
      try {
        localStorage.removeItem('panchved_user');
        localStorage.removeItem('panchved_patient');
        localStorage.removeItem('panchved_prakruti_result');
      } catch (e) {}
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
      const rawImg = pkg.image_url || 'assets/gut-healing-pkg.jpg';
      detailPkgImg.src = (rawImg.startsWith('http') || rawImg.startsWith('../')) ? rawImg : '../' + rawImg;
      detailPkgImg.alt = `${pkg.package_name || 'Package'} - Panchved Ayurved & Physiotherapy`;
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
      pkgData = {
        id: targetId || 1,
        package_id: targetPkgCode || 'PKG-001',
        package_name: cardTitle,
        short_description: cardSubtitle,
        price_formatted: cardPrice,
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
    if (packagesListSection) {
      packagesListSection.style.display = 'grid';
      packagesListSection.style.animation = 'none';
      void packagesListSection.offsetWidth;
      packagesListSection.style.animation = 'fadeInCard 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards';
    }

    history.replaceState(null, '', 'package.html');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Helper: Bind Package Card Action Handlers
  const bindPackageCardEvents = () => {
    const packageButtons = document.querySelectorAll('.btn-package-action');
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

    const cards = document.querySelectorAll('.package-card');
    cards.forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.btn-package-action')) return;
        const pkgId = card.getAttribute('data-id') || card.getAttribute('data-package-id');
        const pkgName = card.getAttribute('data-package') || card.querySelector('.package-title')?.textContent.trim();
        const matched = loadedPackages.find(p => (pkgId && (p.id == pkgId || p.package_id === pkgId)) || (pkgName && p.package_name && p.package_name.toLowerCase() === pkgName.toLowerCase()));
        showPackageDetail(matched || card);
      });
    });
  };

  // Render Packages dynamically from MySQL Database
  const renderPackagesList = (packages) => {
    if (!packagesListSection) return;

    if (!packages || packages.length === 0) {
      packagesListSection.innerHTML = `
        <div class="packages-empty-state" role="status">
          <div class="packages-empty-icon-wrap" aria-hidden="true">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
          </div>
          <h3 class="packages-empty-title">No Health Packages Found</h3>
          <p class="packages-empty-desc">There are currently no health packages available. Please check back shortly or explore our live workshops and expert consultations.</p>
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
      return;
    }

    packagesListSection.innerHTML = packages.map(pkg => `
      <article class="package-card" id="pkg_${pkg.package_id || pkg.id}" data-package-id="${pkg.package_id || pkg.id}" data-id="${pkg.id}" data-package="${pkg.package_name}">
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
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
            </span>
            <span><strong>${pkg.batch_text || (pkg.enrollments + ' Patient Batch')}</strong></span>
          </div>
        </div>

        <div class="package-card-footer">
          <button type="button" class="btn-package-action" data-id="${pkg.id}" data-package-id="${pkg.package_id || pkg.id}" data-package="${pkg.package_name}" data-subtitle="${pkg.short_description || ''}" data-price="${pkg.price_formatted || ('₹' + pkg.price)}">
            <span>View Details</span>
          </button>
        </div>
      </article>
    `).join('');

    bindPackageCardEvents();
  };

  // Fetch Packages List from PHP Backend
  const fetchPackagesFromDB = async () => {
    try {
      const res = await fetch('../api/packages.php?action=list');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.packages) && data.packages.length > 0) {
          loadedPackages = data.packages;
          renderPackagesList(loadedPackages);
          return loadedPackages;
        } else {
          loadedPackages = [];
          renderPackagesList([]);
          return [];
        }
      } else {
        loadedPackages = [];
        renderPackagesList([]);
      }
    } catch (e) {
      console.warn('Notice: Backend fetch packages error:', e);
      loadedPackages = [];
      renderPackagesList([]);
    } finally {
      hidePageLoader();
    }
    return loadedPackages;
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
        const storedUser = JSON.parse(localStorage.getItem('panchved_user') || 'null');
        const storedPatient = JSON.parse(localStorage.getItem('panchved_patient') || 'null');
        if (storedPatient || storedUser) {
          pName = storedPatient?.full_name || storedUser?.full_name || pName;
          pEmail = storedPatient?.email || storedUser?.email || pEmail;
          pPhone = storedPatient?.phone_number || storedUser?.phone_number || pPhone;
          pId = storedPatient?.patient_id || (storedUser?.id ? ('P00' + storedUser.id) : pId);
        }
      } catch (err) {}

      const priceFormatted = detailPkgPrice?.textContent.trim() || currentSelectedPackage?.price_formatted || '₹7,999';
      const durationText = detailPkgDuration?.textContent.trim() || currentSelectedPackage?.duration || '3 Months';
      const docInitials = document.getElementById('doctorAvatarText')?.textContent.trim() || currentSelectedPackage?.doctor?.initials || 'DR';

      const bookingData = {
        isPackageCheckout: true,
        packageDbId: currentSelectedPackage?.id || null,
        packageId: currentSelectedPackage?.package_id || 'PKG-001',
        packageTitle: pkgTitle,
        doctorName: docName,
        doctorRole: docRole,
        doctorInitials: docInitials,
        startingPrice: priceFormatted,
        duration: durationText,
        patientName: pName,
        patientEmail: pEmail,
        patientPhone: pPhone,
        patientId: pId,
        date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
        time: '07:00 - 07:45 PM',
        slot: '7:00 PM - 10:00 PM',
        agenda: `Package Enrollment for ${pkgTitle}`,
        fee: '₹500.00'
      };

      try {
        localStorage.setItem('panchved_consultation_booking', JSON.stringify(bookingData));
        localStorage.setItem('panchved_checkout_type', 'package');
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

  // Initial load & URL Hash on Load
  const initPage = async () => {
    bindPackageCardEvents();
    const pkgs = await fetchPackagesFromDB();
    if (window.location.hash === '#details' || window.location.hash === '#package-details') {
      const urlParams = new URLSearchParams(window.location.search);
      const pkgId = urlParams.get('id') || urlParams.get('package_id');
      const targetPkg = pkgId ? pkgs.find(p => p.id == pkgId || p.package_id === pkgId) : (pkgs[0] || null);
      if (targetPkg) {
        showPackageDetail(targetPkg);
      }
    }
  };

  initPage();
});
