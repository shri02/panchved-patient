/**
 * Panchved Patient Portal - Courses & Workshops Engine
 * Dynamic Database Backend Integration with MySQL workshops table
 * Displays ONLY workshops where attendee_type = 'Patient' (strictly excluding 'Doctor')
 */

document.addEventListener('DOMContentLoaded', () => {
  // Navigation & Drawer Elements
  const mobileMenuToggle = document.getElementById('mobileMenuToggle');
  const dashboardSidebar = document.getElementById('dashboardSidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMsg');

  // Tabs Elements (Screens 1 & 2)
  const tabMyWorkshops = document.getElementById('tabMyWorkshops');
  const tabAllWorkshops = document.getElementById('tabAllWorkshops');
  const myWorkshopsSection = document.getElementById('myWorkshopsSection');
  const allWorkshopsSection = document.getElementById('allWorkshopsSection');
  const workshopDetailSection = document.getElementById('workshopDetailSection');
  const btnBackToWorkshops = document.getElementById('btnBackToWorkshops');
  const navCourses = document.getElementById('navCourses');

  // Workshop Details Elements (Screen 3)
  const detailHeroImg = document.getElementById('detailHeroImg');
  const detailWorkshopTitle = document.getElementById('detailWorkshopTitle');
  const detailWorkshopSubtitle = document.getElementById('detailWorkshopSubtitle');
  const detailWorkshopDate = document.getElementById('detailWorkshopDate');
  const detailWorkshopTime = document.getElementById('detailWorkshopTime');
  const detailWorkshopPrice = document.getElementById('detailWorkshopPrice');
  const detailWorkshopType = document.getElementById('detailWorkshopType');
  const detailWorkshopDesc = document.getElementById('detailWorkshopDesc');
  const workshopDoctorName = document.getElementById('workshopDoctorName');
  const workshopDoctorRole = document.getElementById('workshopDoctorRole');
  const workshopDoctorDesc = document.getElementById('workshopDoctorDesc');
  const workshopDoctorAvatar = document.getElementById('workshopDoctorAvatar');
  const btnRegisterWorkshop = document.getElementById('btnRegisterWorkshop');

  // Memory store for DB patient workshops
  let loadedWorkshops = [];
  let currentSelectedWorkshop = null;

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
    sidebarOverlay.addEventListener('click', () => toggleMobileSidebar(false));
  }

  // Synchronize authenticated user header details
  let cachedUserObj = null;
  let cachedPatientObj = null;
  let cachedPhone = '';
  let cachedPatientId = '';

  const applyUserHeader = (user, patient) => {
    cachedUserObj = user;
    cachedPatientObj = patient;
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

  try {
    const storedUser = JSON.parse(localStorage.getItem('panchved_user') || 'null');
    const storedPatient = JSON.parse(localStorage.getItem('panchved_patient') || 'null');
    if (storedUser || storedPatient) {
      applyUserHeader(storedUser, storedPatient);
      cachedPhone = storedPatient?.phone_number || storedUser?.phone_number || '';
      cachedPatientId = storedPatient?.patient_id || '';
    }
  } catch (err) {}

  const syncHeaderFromDB = async () => {
    try {
      const params = new URLSearchParams();
      if (cachedPhone) params.append('phone', cachedPhone);
      if (cachedPatientId) params.append('patient_id', cachedPatientId);
      const res = await fetch('api/profile.php' + (params.toString() ? `?${params.toString()}` : ''));
      if (res.ok) {
        const data = await res.json();
        if (data.success && (data.patient || data.user)) {
          applyUserHeader(data.user, data.patient);
        }
      }
    } catch (e) {}
  };
  syncHeaderFromDB();

  // Logout Action
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      try { await fetch('api/logout.php', { method: 'POST' }); } catch (err) {}
      try {
        localStorage.removeItem('panchved_user');
        localStorage.removeItem('panchved_patient');
        localStorage.removeItem('panchved_prakruti_result');
      } catch (e) {}
      showToast('Logged out successfully.');
      setTimeout(() => { window.location.href = 'index.html'; }, 350);
    });
  }

  // ========================================================
  // 1. TABS SWITCHING (My Workshops vs All Workshops)
  // ========================================================
  const switchTab = (tabName) => {
    // Hide details view if open
    if (workshopDetailSection) workshopDetailSection.style.display = 'none';

    if (tabName === 'all') {
      tabMyWorkshops?.classList.remove('active');
      tabMyWorkshops?.setAttribute('aria-selected', 'false');
      tabAllWorkshops?.classList.add('active');
      tabAllWorkshops?.setAttribute('aria-selected', 'true');

      if (myWorkshopsSection) myWorkshopsSection.style.display = 'none';
      if (allWorkshopsSection) {
        allWorkshopsSection.style.display = 'grid';
        allWorkshopsSection.style.animation = 'none';
        void allWorkshopsSection.offsetWidth;
        allWorkshopsSection.style.animation = 'fadeInCard 0.3s ease-out forwards';
      }
      history.replaceState(null, '', '#all-workshops');
    } else {
      tabAllWorkshops?.classList.remove('active');
      tabAllWorkshops?.setAttribute('aria-selected', 'false');
      tabMyWorkshops?.classList.add('active');
      tabMyWorkshops?.setAttribute('aria-selected', 'true');

      if (allWorkshopsSection) allWorkshopsSection.style.display = 'none';
      if (myWorkshopsSection) {
        myWorkshopsSection.style.display = 'grid';
        myWorkshopsSection.style.animation = 'none';
        void myWorkshopsSection.offsetWidth;
        myWorkshopsSection.style.animation = 'fadeInCard 0.3s ease-out forwards';
      }
      history.replaceState(null, '', '#my-workshops');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (tabMyWorkshops) {
    tabMyWorkshops.addEventListener('click', () => switchTab('my'));
  }

  if (tabAllWorkshops) {
    tabAllWorkshops.addEventListener('click', () => switchTab('all'));
  }

  // ========================================================
  // 2. GOOGLE MEET LINK ACTIONS (Screen 1)
  // ========================================================
  const bindMeetLinkEvents = () => {
    // Copy button
    const copyMeetButtons = document.querySelectorAll('.btn-copy-meet-mini');
    copyMeetButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const link = btn.getAttribute('data-link') || 'https://meet.google.com/abc-xyz-pqrs';
        navigator.clipboard?.writeText(link)
          .then(() => showToast('Google Meet link copied to clipboard!'))
          .catch(() => showToast('Meet link: ' + link));
      });
    });

    // Join Meet Button
    const joinMeetButtons = document.querySelectorAll('.btn-join-meet:not(.btn-view-workshop-details)');
    joinMeetButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const link = btn.getAttribute('data-link') || 'https://meet.google.com/abc-xyz-pqrs';
        showToast('Opening Google Meet session...');
        window.open(link, '_blank');
      });
    });
  };
  bindMeetLinkEvents();

  // ========================================================
  // 3. POPULATE & DISPLAY WORKSHOP DETAILS (Screens 2 -> 3)
  // ========================================================
  const populateWorkshopDetailsView = (ws) => {
    if (!ws) return;
    currentSelectedWorkshop = ws;

    const title = ws.title || 'Ayurveda Workshop';
    const subtitle = ws.subtitle || 'Holistic Health & Ayurveda Insights';
    const priceFormatted = ws.fee_formatted || (ws.fee ? `₹${ws.fee}/-` : '₹499/-');
    const duration = ws.duration_text || '90 mins';
    const date = ws.formatted_date || ws.date || '3 September, Wednesday';
    const time = ws.time || '8:00 AM';
    const img = ws.image_url || 'assets/courses/course_ayurveda_herbs.jpg';
    const about = ws.about || subtitle || 'A comprehensive interactive workshop covering authentic Ayurvedic health strategies, nutrition guides, and lifestyle routines.';
    const speaker = ws.speaker || ws.instructor || ws.assign_speaker || 'Dr. Rajesh Varma';
    const role = ws.speaker_role || 'Ayurveda Physician';
    const bio = ws.speaker_bio || `${speaker} is a dedicated Ayurvedic practitioner committed to patient-centric holistic healing, dosha balancing, and preventive lifestyle routines.`;
    const initials = ws.speaker_initials || 'DR';

    if (detailWorkshopTitle) detailWorkshopTitle.textContent = title;
    if (detailWorkshopSubtitle) detailWorkshopSubtitle.textContent = subtitle;
    if (detailWorkshopPrice) detailWorkshopPrice.textContent = priceFormatted;
    if (detailWorkshopType) detailWorkshopType.textContent = duration;
    if (detailWorkshopDate) detailWorkshopDate.textContent = date;
    if (detailWorkshopTime) detailWorkshopTime.textContent = time;
    if (detailHeroImg) {
      detailHeroImg.src = img;
      detailHeroImg.alt = title;
    }

    if (detailWorkshopDesc) detailWorkshopDesc.textContent = about;
    if (workshopDoctorName) workshopDoctorName.textContent = speaker;
    if (workshopDoctorRole) workshopDoctorRole.textContent = role;
    
    if (workshopDoctorDesc) {
      workshopDoctorDesc.textContent = bio;
    } else {
      const docDescEl = document.querySelector('.package-section-desc.doctor-desc');
      if (docDescEl) docDescEl.textContent = bio;
    }

    if (workshopDoctorAvatar) {
      workshopDoctorAvatar.textContent = initials;
    } else {
      const avatarEl = document.querySelector('.doctor-avatar span');
      if (avatarEl) avatarEl.textContent = initials;
    }
  };

  const showWorkshopDetails = (wsOrCard) => {
    let wsData = null;

    if (wsOrCard && typeof wsOrCard === 'object' && wsOrCard.title) {
      wsData = wsOrCard;
    } else if (wsOrCard instanceof HTMLElement) {
      const wsId = wsOrCard.getAttribute('data-id') || wsOrCard.getAttribute('data-workshop-id');
      const wsTitle = wsOrCard.getAttribute('data-title') || wsOrCard.querySelector('.workshop-title')?.textContent.trim();

      if (wsId || wsTitle) {
        wsData = loadedWorkshops.find(w => 
          (wsId && (w.id == wsId || w.workshop_id === wsId)) || 
          (wsTitle && w.title && w.title.toLowerCase() === wsTitle.toLowerCase())
        );
      }

      // Fallback from element attributes if not found in loaded array
      if (!wsData) {
        wsData = {
          id: wsId || 1,
          workshop_id: wsOrCard.getAttribute('data-workshop-id') || 'WS-002',
          title: wsOrCard.getAttribute('data-title') || wsTitle || 'Ayurveda Workshop',
          subtitle: wsOrCard.getAttribute('data-subtitle') || 'Holistic Health & Ayurveda Insights',
          fee_formatted: wsOrCard.getAttribute('data-price') || '₹799/-',
          duration_text: wsOrCard.getAttribute('data-type') || '90 mins',
          formatted_date: wsOrCard.getAttribute('data-date') || '3 September, Wednesday',
          time: wsOrCard.getAttribute('data-time') || '8:00 AM',
          image_url: wsOrCard.getAttribute('data-img') || 'assets/courses/course_ayurveda_herbs.jpg',
          about: wsOrCard.getAttribute('data-about') || '',
          speaker: wsOrCard.getAttribute('data-doctor-name') || 'Dr. Rajesh Varma',
          speaker_role: wsOrCard.getAttribute('data-doctor-role') || 'Ayurveda Physician',
          speaker_bio: wsOrCard.getAttribute('data-doctor-bio') || '',
          attendee_type: 'Patient'
        };
      }
    }

    if (wsData) {
      populateWorkshopDetailsView(wsData);
    }

    // Hide tabs content & show details view
    if (myWorkshopsSection) myWorkshopsSection.style.display = 'none';
    if (allWorkshopsSection) allWorkshopsSection.style.display = 'none';
    if (workshopDetailSection) {
      workshopDetailSection.style.display = 'flex';
      workshopDetailSection.style.animation = 'none';
      void workshopDetailSection.offsetWidth;
      workshopDetailSection.style.animation = 'fadeInCard 0.32s ease-out forwards';
    }

    history.replaceState(null, '', '#details');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Helper: Bind Workshop Card Events
  const bindWorkshopCardEvents = () => {
    const viewButtons = document.querySelectorAll('.btn-view-workshop-details');
    viewButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const card = btn.closest('.workshop-card');
        showWorkshopDetails(card || btn);
      });
    });

    const cards = document.querySelectorAll('#allWorkshopsSection .workshop-card');
    cards.forEach(card => {
      card.style.cursor = 'pointer';
      card.addEventListener('click', (e) => {
        if (e.target.closest('.btn-view-workshop-details') || e.target.closest('button')) return;
        showWorkshopDetails(card);
      });
    });
  };

  // ========================================================
  // 4. RENDER ALL WORKSHOPS LIST (Strictly attendee_type = 'Patient')
  // ========================================================
  const renderAllWorkshopsList = (workshops) => {
    if (!allWorkshopsSection || !Array.isArray(workshops) || workshops.length === 0) return;

    // Filter strictly to guarantee only Patient attendee workshops are rendered
    const patientWorkshops = workshops.filter(ws => {
      const att = (ws.attendee_type || '').toLowerCase().trim();
      return att === 'patient' && att !== 'doctor';
    });

    if (patientWorkshops.length === 0) return;

    allWorkshopsSection.innerHTML = patientWorkshops.map(ws => {
      const img = ws.image_url || 'assets/courses/course_ayurveda_herbs.jpg';
      const priceText = ws.fee_formatted || (ws.fee ? `₹${ws.fee}/-` : '₹499/-');
      const duration = ws.duration_text || '90 mins';
      const dateText = ws.formatted_date || ws.date || '3 September, Wednesday';
      const timeText = ws.time || '8:00 AM';
      const subtitleText = ws.subtitle || 'Holistic Health & Ayurveda Insights';
      const speakerName = ws.speaker || ws.instructor || ws.assign_speaker || 'Dr. Rajesh Varma';
      const speakerRole = ws.speaker_role || 'Ayurveda Physician';
      const speakerBio = ws.speaker_bio || '';
      const aboutText = ws.about || subtitleText;

      return `
        <article class="workshop-card" 
          id="ws_${ws.workshop_id || ws.id}" 
          data-id="${ws.id}" 
          data-workshop-id="${ws.workshop_id || ws.id}" 
          data-title="${ws.title}"
          data-subtitle="${subtitleText}"
          data-price="${priceText}"
          data-type="${duration}"
          data-date="${dateText}"
          data-time="${timeText}"
          data-img="${img}"
          data-about="${aboutText.replace(/"/g, '&quot;')}"
          data-doctor-name="${speakerName.replace(/"/g, '&quot;')}"
          data-doctor-role="${speakerRole.replace(/"/g, '&quot;')}"
          data-doctor-bio="${speakerBio.replace(/"/g, '&quot;')}"
          data-attendee="Patient"
        >
          <div class="workshop-card-img-wrap">
            <img src="${img}" alt="${ws.title}" class="workshop-card-img" />
          </div>
          <div class="workshop-card-content">
            <div class="workshop-card-header">
              <h2 class="workshop-title">${ws.title}</h2>
              <p class="workshop-subtitle">${subtitleText}</p>
            </div>

            <div class="workshop-meta-list">
              <div class="workshop-meta-item">
                <span class="meta-icon" aria-hidden="true">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                  </svg>
                </span>
                <span><strong>${priceText}</strong> (${duration})</span>
              </div>
              <div class="workshop-meta-item">
                <span class="meta-icon" aria-hidden="true">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                </span>
                <span><strong>${dateText}</strong></span>
              </div>
              <div class="workshop-meta-item">
                <span class="meta-icon" aria-hidden="true">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                </span>
                <span><strong>${timeText}</strong></span>
              </div>
            </div>

            <button type="button" class="btn-join-meet btn-view-workshop-details" 
              data-id="${ws.id}"
              data-workshop-id="${ws.workshop_id || ws.id}"
              data-title="${ws.title}" 
              data-subtitle="${subtitleText}" 
              data-price="${priceText}" 
              data-type="${duration}" 
              data-date="${dateText}" 
              data-time="${timeText}" 
              data-img="${img}"
              data-about="${aboutText.replace(/"/g, '&quot;')}"
              data-doctor-name="${speakerName.replace(/"/g, '&quot;')}"
              data-doctor-role="${speakerRole.replace(/"/g, '&quot;')}"
              data-doctor-bio="${speakerBio.replace(/"/g, '&quot;')}"
            >
              <span>View Details</span>
            </button>
          </div>
        </article>
      `;
    }).join('');

    bindWorkshopCardEvents();
  };

  // ========================================================
  // 5. FETCH WORKSHOPS DYNAMICALLY FROM DATABASE
  // ========================================================
  const fetchPatientWorkshopsFromDB = async () => {
    try {
      const res = await fetch('api/workshops.php?attendee_type=Patient');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.workshops)) {
          // Strictly filter out any workshops that do not have attendee_type = 'Patient'
          loadedWorkshops = data.workshops.filter(ws => {
            const att = (ws.attendee_type || '').toLowerCase().trim();
            return att === 'patient' && att !== 'doctor';
          });
          renderAllWorkshopsList(loadedWorkshops);
        }
      }
    } catch (err) {
      console.warn('Notice: Error fetching workshops from DB:', err);
    }
  };

  // Initial fetch from MySQL DB
  fetchPatientWorkshopsFromDB();
  bindWorkshopCardEvents();

  if (btnBackToWorkshops) {
    btnBackToWorkshops.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab('all');
    });
  }

  if (navCourses) {
    navCourses.addEventListener('click', (e) => {
      if (workshopDetailSection && workshopDetailSection.style.display !== 'none') {
        e.preventDefault();
        switchTab('my');
      }
    });
  }

  // ========================================================
  // 6. REGISTER CTA -> PROCEED TO CHECKOUT (Screens 3 -> 4)
  // ========================================================
  if (btnRegisterWorkshop) {
    btnRegisterWorkshop.addEventListener('click', (e) => {
      e.preventDefault();

      const title = detailWorkshopTitle?.textContent.trim() || 'Ayurveda Lifestyle Workshop';
      const date = detailWorkshopDate?.textContent.trim() || '2 September 2026';
      const time = detailWorkshopTime?.textContent.trim() || '08:00 AM';
      const priceText = detailWorkshopPrice?.textContent.trim() || '₹500.00';

      const docName = currentSelectedWorkshop?.speaker || currentSelectedWorkshop?.instructor || currentSelectedWorkshop?.assign_speaker || workshopDoctorName?.textContent.trim() || 'Dr. Ananya Mehta';
      const docRole = currentSelectedWorkshop?.speaker_role || workshopDoctorRole?.textContent.trim() || 'Ayurveda Physician';

      const patientName = cachedPatientObj?.full_name || cachedUserObj?.full_name || 'Rahul Sharma';
      const patientEmail = cachedPatientObj?.email || cachedUserObj?.email || 'rahulsharma@gmail.com';
      const patientPhone = cachedPatientObj?.phone_number || cachedUserObj?.phone_number || '9876543210';

      // Save workshop checkout data into localStorage
      const workshopBooking = {
        isWorkshop: true,
        workshopId: currentSelectedWorkshop?.workshop_id || currentSelectedWorkshop?.id || 'WS-002',
        id: currentSelectedWorkshop?.id || 1,
        workshopTitle: title,
        title: title,
        doctorName: docName,
        speaker: docName,
        doctorRole: docRole,
        date: date,
        time: time,
        fee: priceText,
        price: currentSelectedWorkshop?.price || currentSelectedWorkshop?.fee || 500,
        patientName: patientName,
        patientEmail: patientEmail,
        patientPhone: patientPhone
      };

      try {
        localStorage.setItem('panchved_workshop_booking', JSON.stringify(workshopBooking));
        localStorage.setItem('panchved_checkout_type', 'workshop');
      } catch (err) {
        console.warn('localStorage error', err);
      }

      const originalHtml = btnRegisterWorkshop.innerHTML;
      btnRegisterWorkshop.disabled = true;
      btnRegisterWorkshop.style.opacity = '0.85';
      btnRegisterWorkshop.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="animation: spin 0.8s linear infinite;">
          <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)"></circle>
          <path d="M12 2a10 10 0 0 1 10 10" stroke="#ffffff"></path>
        </svg>
        <span>Redirecting to Checkout...</span>
      `;

      const wsParam = currentSelectedWorkshop?.workshop_id 
        ? `workshop_id=${encodeURIComponent(currentSelectedWorkshop.workshop_id)}` 
        : (currentSelectedWorkshop?.id ? `id=${encodeURIComponent(currentSelectedWorkshop.id)}` : `title=${encodeURIComponent(title)}`);

      setTimeout(() => {
        btnRegisterWorkshop.disabled = false;
        btnRegisterWorkshop.style.opacity = '1';
        btnRegisterWorkshop.innerHTML = originalHtml;
        window.location.href = `courses-checkout.html?${wsParam}`;
      }, 500);
    });
  }

  // Check initial hash on load
  if (window.location.hash === '#all-workshops' || window.location.hash === '#all') {
    switchTab('all');
  } else if (window.location.hash === '#details') {
    const firstBtn = document.querySelector('.btn-view-workshop-details');
    if (firstBtn) firstBtn.click();
  }
});
