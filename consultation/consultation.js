/**
 * Ocayur Patient Portal - Consultations Engine
 * Handles: Tabs, Search Filtering, Google Meet Copying, View Details Modal,
 * Medical Prescription Modal, and Booking Modal Flow.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Navigation & Drawer Elements
  const mobileMenuToggle = document.getElementById('mobileMenuToggle');
  const dashboardSidebar = document.getElementById('dashboardSidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMsg');

  // Tabs Elements (Screens 1 & 2)
  const tabMyAppointments = document.getElementById('tabMyAppointments');
  const tabAppointmentHistory = document.getElementById('tabAppointmentHistory');
  const myAppointmentsContent = document.getElementById('myAppointmentsContent');
  const appointmentHistoryContent = document.getElementById('appointmentHistoryContent');

  // Search & Toolbar Elements
  const consultSearchInput = document.getElementById('consultSearchInput');
  const btnBookConsultCTA = document.getElementById('btnBookConsultCTA');

  // Modals Elements
  // Modal 1: View Appointment History Details (Screen 3)
  const viewAppointmentModal = document.getElementById('viewAppointmentModal');
  const closeViewModalBtn = document.getElementById('closeViewModalBtn');
  const viewDetailId = document.getElementById('viewDetailId');
  const viewDetailDate = document.getElementById('viewDetailDate');
  const viewDetailTime = document.getElementById('viewDetailTime');
  const viewDetailDoctor = document.getElementById('viewDetailDoctor');
  const viewDetailDuration = document.getElementById('viewDetailDuration');
  const viewDetailAgenda = document.getElementById('viewDetailAgenda');
  const btnOpenPrescriptionModal = document.getElementById('btnOpenPrescriptionModal');

  // Modal 2: Medical Prescription Document (Screen 4)
  const prescriptionModal = document.getElementById('prescriptionModal');
  const closePrescriptionModalBtn = document.getElementById('closePrescriptionModalBtn');
  const btnPrintPrescription = document.getElementById('btnPrintPrescription');

  // Modal 3: Online Ayurved Consultation Booking Modal
  const consultationModal = document.getElementById('consultationModal');
  const closeConsultationModalBtn = document.getElementById('closeConsultationModalBtn');
  const consultationBookingForm = document.getElementById('consultationBookingForm');
  const consultDoctor = document.getElementById('consultDoctor');
  const consultName = document.getElementById('consultName');
  const consultMobile = document.getElementById('consultMobile');
  const consultEmail = document.getElementById('consultEmail');
  const consultDate = document.getElementById('consultDate');
  const btnDateCalendar = document.getElementById('btnDateCalendar');
  const nativeDatePicker = document.getElementById('nativeDatePicker');
  const consultStartTime = document.getElementById('consultStartTime');
  const btnStartTimeClock = document.getElementById('btnStartTimeClock');
  const startTimeDropdown = document.getElementById('startTimeDropdown');
  const consultEndTime = document.getElementById('consultEndTime');
  const btnEndTimeClock = document.getElementById('btnEndTimeClock');
  const consultAgenda = document.getElementById('consultAgenda') || document.getElementById('consultComplaint');
  const submitConsultationBtn = document.getElementById('submitConsultationBtn');

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

  // Helper: Close Any Active Modal
  const closeAllModals = () => {
    [viewAppointmentModal, prescriptionModal, consultationModal].forEach(modal => {
      if (modal) {
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
      }
    });
    document.body.style.overflow = '';
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
      closeAllModals();
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
  } catch (err) {}

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
        localStorage.removeItem('ocayur_user'); localStorage.removeItem('panchved_user');
        localStorage.removeItem('ocayur_patient'); localStorage.removeItem('panchved_patient');
        localStorage.removeItem('ocayur_prakruti_result'); localStorage.removeItem('panchved_prakruti_result');
      } catch (e) {}
      showToast('Logged out successfully.');
      setTimeout(() => { window.location.href = '../index.html'; }, 350);
    });
  }

  // ========================================================
  // 1. TABS SWITCHING (Screen 1 vs Screen 2)
  // ========================================================
  const switchTab = (tabName) => {
    if (tabName === 'history') {
      tabMyAppointments?.classList.remove('active');
      tabMyAppointments?.setAttribute('aria-selected', 'false');
      tabAppointmentHistory?.classList.add('active');
      tabAppointmentHistory?.setAttribute('aria-selected', 'true');

      // Remove / Hide Book Consultation CTA on Appointment History view
      if (btnBookConsultCTA) {
        btnBookConsultCTA.style.display = 'none';
      }

      if (myAppointmentsContent) myAppointmentsContent.style.display = 'none';
      if (appointmentHistoryContent) {
        appointmentHistoryContent.style.display = 'block';
        appointmentHistoryContent.style.animation = 'none';
        void appointmentHistoryContent.offsetWidth;
        appointmentHistoryContent.style.animation = 'fadeInCard 0.28s ease-out forwards';
      }
      history.replaceState(null, '', '#history');
      applySearchFilter();
    } else {
      tabAppointmentHistory?.classList.remove('active');
      tabAppointmentHistory?.setAttribute('aria-selected', 'false');
      tabMyAppointments?.classList.add('active');
      tabMyAppointments?.setAttribute('aria-selected', 'true');

      // Restore Book Consultation CTA on My Appointments view
      if (btnBookConsultCTA) {
        btnBookConsultCTA.style.display = '';
      }

      if (appointmentHistoryContent) appointmentHistoryContent.style.display = 'none';
      if (myAppointmentsContent) {
        myAppointmentsContent.style.display = 'block';
        myAppointmentsContent.style.animation = 'none';
        void myAppointmentsContent.offsetWidth;
        myAppointmentsContent.style.animation = 'fadeInCard 0.28s ease-out forwards';
      }
      history.replaceState(null, '', '#my-appointments');
      applySearchFilter();
    }
  };

  if (tabMyAppointments) {
    tabMyAppointments.addEventListener('click', () => switchTab('my-appointments'));
  }

  if (tabAppointmentHistory) {
    tabAppointmentHistory.addEventListener('click', () => switchTab('history'));
  }

  // Check initial hash on load
  if (window.location.hash === '#history' || window.location.hash === '#appointment-history') {
    switchTab('history');
  }

  // ========================================================
  // 2. SEARCH FILTERING (Shows "No records found" on 0 matches)
  // ========================================================
  const applySearchFilter = () => {
    const term = consultSearchInput ? consultSearchInput.value.toLowerCase().trim() : '';
    const isHistoryTab = (appointmentHistoryContent && appointmentHistoryContent.style.display !== 'none');

    if (isHistoryTab) {
      const tableBody = document.getElementById('appointmentHistoryTableBody');
      if (!tableBody) return;

      if (!term) {
        renderAppointmentHistoryTable();
        return;
      }

      const filtered = (loadedHistoryAppts || []).filter(appt => {
        const apptId = (appt.appointment_id || ('ABC-' + String(appt.id).padStart(3, '0'))).toLowerCase();
        const dateFormatted = formatDate(appt.appointment_date).toLowerCase();
        const timeVal = (appt.appointment_time || '').toLowerCase();
        const doctorName = (appt.doctor_name || '').toLowerCase();
        const agendaText = (appt.agenda || appt.service_type || '').toLowerCase();
        const durationVal = formatDuration(appt.duration).toLowerCase();

        return apptId.includes(term) ||
               dateFormatted.includes(term) ||
               timeVal.includes(term) ||
               doctorName.includes(term) ||
               agendaText.includes(term) ||
               durationVal.includes(term);
      });

      if (filtered.length === 0) {
        tableBody.innerHTML = `
          <tr class="no-records-row">
            <td colspan="7" style="text-align: center; padding: 36px 20px; color: #64748b; font-size: 14px; font-weight: 500;">
              No records found
            </td>
          </tr>
        `;
        if (historyCountText) historyCountText.textContent = 'Showing 0 items';
        if (historyPageLabel) historyPageLabel.textContent = '1 of 1';
        if (btnHistoryPrev) btnHistoryPrev.disabled = true;
        if (btnHistoryNext) btnHistoryNext.disabled = true;
      } else {
        tableBody.innerHTML = filtered.map(appt => {
          const apptId = appt.appointment_id || ('ABC-' + String(appt.id).padStart(3, '0'));
          const dateFormatted = formatDate(appt.appointment_date);
          const timeVal = appt.appointment_time || '3:00 PM';
          const doctorName = appt.doctor_name || 'Dr. Rohit Mehra';
          const agendaText = appt.agenda || appt.service_type || 'Ayurvedic consultation and pulse diagnostics review';
          const durationVal = formatDuration(appt.duration);
          const prescriptionData = typeof appt.prescription === 'object' ? JSON.stringify(appt.prescription) : (appt.prescription || '');

          return `
            <tr>
              <td class="table-id-cell">${escapeHtml(apptId)}</td>
              <td class="table-date-cell">${escapeHtml(dateFormatted)}</td>
              <td class="table-time-cell">${escapeHtml(timeVal)}</td>
              <td class="table-doctor-cell">${escapeHtml(doctorName)}</td>
              <td class="table-agenda-cell" title="${escapeHtml(agendaText)}">${escapeHtml(agendaText)}</td>
              <td class="table-duration-cell">${escapeHtml(durationVal)}</td>
              <td class="table-action-cell">
                <button 
                  type="button" 
                  class="btn-view-history" 
                  data-db-id="${escapeHtml(appt.id)}"
                  data-id="${escapeHtml(apptId)}" 
                  data-date="${escapeHtml(dateFormatted)}" 
                  data-time="${escapeHtml(timeVal)}" 
                  data-doctor="${escapeHtml(doctorName)}" 
                  data-duration="${escapeHtml(durationVal)}" 
                  data-agenda="${escapeHtml(agendaText)}"
                  data-patient="${escapeHtml(appt.patient_name || 'Rahul Sharma')}"
                  data-prescription="${escapeHtml(prescriptionData)}"
                  data-notes="${escapeHtml(appt.notes || '')}"
                >
                  <span>View</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                </button>
              </td>
            </tr>
          `;
        }).join('');

        if (historyCountText) historyCountText.textContent = `Showing ${filtered.length} matching item${filtered.length > 1 ? 's' : ''}`;
        if (historyPageLabel) historyPageLabel.textContent = '1 of 1';
        if (btnHistoryPrev) btnHistoryPrev.disabled = true;
        if (btnHistoryNext) btnHistoryNext.disabled = true;
        bindViewHistoryButtons();
      }
    } else {
      const tableBody = document.getElementById('myAppointmentsTableBody');
      if (!tableBody) return;

      if (!term) {
        renderMyAppointmentsTable();
        return;
      }

      const filtered = (loadedMyAppts || []).filter(appt => {
        const apptId = (appt.appointment_id || ('APT-' + appt.id)).toLowerCase();
        const dateFormatted = formatDate(appt.appointment_date).toLowerCase();
        const timeVal = (appt.appointment_time || '').toLowerCase();
        const doctorName = (appt.doctor_name || '').toLowerCase();
        const agendaText = (appt.agenda || appt.service_type || '').toLowerCase();
        const durationVal = formatDuration(appt.duration).toLowerCase();

        return apptId.includes(term) ||
               dateFormatted.includes(term) ||
               timeVal.includes(term) ||
               doctorName.includes(term) ||
               agendaText.includes(term) ||
               durationVal.includes(term);
      });

      if (filtered.length === 0) {
        tableBody.innerHTML = `
          <tr class="no-records-row">
            <td colspan="7" style="text-align: center; padding: 36px 20px; color: #64748b; font-size: 14px; font-weight: 500;">
              No records found
            </td>
          </tr>
        `;
        if (myApptsCountText) myApptsCountText.textContent = 'Showing 0 items';
        if (myApptsPageLabel) myApptsPageLabel.textContent = '1 of 1';
        if (btnMyApptsPrev) btnMyApptsPrev.disabled = true;
        if (btnMyApptsNext) btnMyApptsNext.disabled = true;
      } else {
        tableBody.innerHTML = filtered.map(appt => {
          const apptId = appt.appointment_id || ('APT-' + appt.id);
          const dateFormatted = formatDate(appt.appointment_date);
          const timeVal = appt.appointment_time || '3:00 PM';
          const doctorName = appt.doctor_name || 'Dr. Rohit Mishra';
          const agendaText = appt.agenda || appt.service_type || 'Ayurvedic consultation and pulse diagnostics';
          const durationVal = formatDuration(appt.duration);
          const meetLink = appt.meet_link || getMeetLink(doctorName, apptId);

          return `
            <tr>
              <td class="table-id-cell">${escapeHtml(apptId)}</td>
              <td class="table-date-cell">${escapeHtml(dateFormatted)}</td>
              <td class="table-time-cell">${escapeHtml(timeVal)}</td>
              <td class="table-doctor-cell">${escapeHtml(doctorName)}</td>
              <td class="table-agenda-cell" title="${escapeHtml(agendaText)}">${escapeHtml(agendaText)}</td>
              <td class="table-duration-cell">${escapeHtml(durationVal)}</td>
              <td class="table-action-cell">
                <button type="button" class="meet-link-btn" data-link="${escapeHtml(meetLink)}" title="Copy Google Meet Link">
                  <span>meet.google...</span>
                  <svg class="copy-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                </button>
              </td>
            </tr>
          `;
        }).join('');

        if (myApptsCountText) myApptsCountText.textContent = `Showing ${filtered.length} matching item${filtered.length > 1 ? 's' : ''}`;
        if (myApptsPageLabel) myApptsPageLabel.textContent = '1 of 1';
        if (btnMyApptsPrev) btnMyApptsPrev.disabled = true;
        if (btnMyApptsNext) btnMyApptsNext.disabled = true;
        bindMeetLinkButtons();
      }
    }
  };

  if (consultSearchInput) {
    consultSearchInput.addEventListener('input', () => {
      applySearchFilter();
    });
  }

  // ========================================================
  // 3. DYNAMIC APPOINTMENTS INTEGRATION (UPCOMING & HISTORY)
  // ========================================================
  let loadedMyAppts = [];
  let loadedHistoryAppts = [];
  let currentMyApptPage = 1;
  let currentHistoryPage = 1;
  const itemsPerPage = 5;

  const btnMyApptsPrev = document.getElementById('btnMyApptsPrev');
  const btnMyApptsNext = document.getElementById('btnMyApptsNext');
  const myApptsPageLabel = document.getElementById('myApptsPageLabel');
  const myApptsCountText = document.getElementById('myApptsCountText');

  const btnHistoryPrev = document.getElementById('btnHistoryPrev');
  const btnHistoryNext = document.getElementById('btnHistoryNext');
  const historyPageLabel = document.getElementById('historyPageLabel');
  const historyCountText = document.getElementById('historyCountText');

  const formatDate = (dateStr) => {
    if (!dateStr) return '2 Sept 2026';
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const parts = dateStr.split('-');
      const year = parts[0];
      const monthIndex = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
      const month = months[monthIndex] || parts[1];
      return `${day} ${month} ${year}`;
    }
    return dateStr;
  };

  const formatDuration = (dur) => {
    if (!dur) return '45 mins';
    if (/^\d+$/.test(dur)) return `${dur} mins`;
    if (typeof dur === 'string' && !dur.toLowerCase().includes('min')) return `${dur} mins`;
    return dur;
  };

  const getMeetLink = (doctorName, apptId) => {
    const cleanDoc = (doctorName || 'consult').toLowerCase().replace(/dr\.?|\s+/g, '').replace(/[^a-z0-9]/g, '');
    return `https://meet.google.com/abc-${cleanDoc || 'ocayur'}-ocayur`;
  };

  const escapeHtml = (str) => {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  // Bind copy button for Google Meet links in My Appointments
  const bindMeetLinkButtons = () => {
    const meetLinkButtons = document.querySelectorAll('.meet-link-btn');
    meetLinkButtons.forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const link = btn.getAttribute('data-link') || 'https://meet.google.com/ocayur-consult';
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(link)
            .then(() => showToast('Google Meet link copied to clipboard!'))
            .catch(() => showToast('Google Meet link: ' + link));
        } else {
          showToast('Google Meet link: ' + link);
        }
      };
    });
  };

  let activeSelectedAppt = null;

  // Bind view details button in Appointment History
  const bindViewHistoryButtons = () => {
    const viewHistoryButtons = document.querySelectorAll('.btn-view-history');
    viewHistoryButtons.forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        const apptDbId = btn.getAttribute('data-db-id') || btn.getAttribute('data-id');
        const apptCode = btn.getAttribute('data-id');

        // Look up full database record from loadedHistoryAppts
        const found = loadedHistoryAppts.find(a => String(a.id) === String(apptDbId) || a.appointment_id === apptCode);
        if (found) {
          activeSelectedAppt = found;
        } else {
          activeSelectedAppt = {
            id: apptDbId,
            appointment_id: apptCode,
            appointment_date: btn.getAttribute('data-date'),
            appointment_time: btn.getAttribute('data-time'),
            doctor_name: btn.getAttribute('data-doctor'),
            duration: btn.getAttribute('data-duration'),
            agenda: btn.getAttribute('data-agenda'),
            patient_name: btn.getAttribute('data-patient'),
            prescription: btn.getAttribute('data-prescription'),
            notes: btn.getAttribute('data-notes')
          };
        }

        const id = activeSelectedAppt.appointment_id || ('APT-' + activeSelectedAppt.id);
        const date = formatDate(activeSelectedAppt.appointment_date);
        const time = activeSelectedAppt.appointment_time || '03:00 - 03:45 PM';
        const doctor = activeSelectedAppt.doctor_name || 'Dr. Rohit Mehra';
        const duration = formatDuration(activeSelectedAppt.duration);
        const agenda = activeSelectedAppt.agenda || 'Ayurvedic consultation and pulse diagnostics review';

        if (viewDetailId) viewDetailId.textContent = id;
        if (viewDetailDate) viewDetailDate.textContent = date;
        if (viewDetailTime) viewDetailTime.textContent = time;
        if (viewDetailDoctor) viewDetailDoctor.textContent = doctor;
        if (viewDetailDuration) viewDetailDuration.textContent = duration;
        if (viewDetailAgenda) viewDetailAgenda.textContent = agenda;

        if (viewAppointmentModal) {
          viewAppointmentModal.classList.add('active');
          viewAppointmentModal.setAttribute('aria-hidden', 'false');
          document.body.style.overflow = 'hidden';
        }
      };
    });
  };

  // Render Table 1: My Appointments (Upcoming: date & time > now)
  const renderMyAppointmentsTable = () => {
    const tableBody = document.getElementById('myAppointmentsTableBody');
    if (!tableBody) return;

    if (!loadedMyAppts || loadedMyAppts.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 32px; color: #64748b;">
            No upcoming consultation appointments found.
          </td>
        </tr>
      `;
      if (myApptsCountText) myApptsCountText.textContent = 'Showing 0 items';
      if (myApptsPageLabel) myApptsPageLabel.textContent = '1 of 1';
      if (btnMyApptsPrev) btnMyApptsPrev.disabled = true;
      if (btnMyApptsNext) btnMyApptsNext.disabled = true;
      return;
    }

    const totalItems = loadedMyAppts.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
    if (currentMyApptPage > totalPages) currentMyApptPage = totalPages;
    if (currentMyApptPage < 1) currentMyApptPage = 1;

    const startIdx = (currentMyApptPage - 1) * itemsPerPage;
    const endIdx = Math.min(startIdx + itemsPerPage, totalItems);
    const pageItems = loadedMyAppts.slice(startIdx, endIdx);

    tableBody.innerHTML = pageItems.map(appt => {
      const apptId = appt.appointment_id || ('APT-' + appt.id);
      const dateFormatted = formatDate(appt.appointment_date);
      const timeVal = appt.appointment_time || '3:00 PM';
      const doctorName = appt.doctor_name || 'Dr. Rohit Mishra';
      const agendaText = appt.agenda || appt.service_type || 'Ayurvedic consultation and pulse diagnostics';
      const durationVal = formatDuration(appt.duration);
      const meetLink = appt.meet_link || getMeetLink(doctorName, apptId);

      return `
        <tr>
          <td class="table-id-cell">${escapeHtml(apptId)}</td>
          <td class="table-date-cell">${escapeHtml(dateFormatted)}</td>
          <td class="table-time-cell">${escapeHtml(timeVal)}</td>
          <td class="table-doctor-cell">${escapeHtml(doctorName)}</td>
          <td class="table-agenda-cell" title="${escapeHtml(agendaText)}">${escapeHtml(agendaText)}</td>
          <td class="table-duration-cell">${escapeHtml(durationVal)}</td>
          <td class="table-action-cell">
            <button type="button" class="meet-link-btn" data-link="${escapeHtml(meetLink)}" title="Copy Google Meet Link">
              <span>meet.google...</span>
              <svg class="copy-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    if (myApptsPageLabel) myApptsPageLabel.textContent = `${currentMyApptPage} of ${totalPages}`;
    if (myApptsCountText) myApptsCountText.textContent = `Showing ${startIdx + 1} to ${endIdx} of ${totalItems} items`;
    if (btnMyApptsPrev) btnMyApptsPrev.disabled = currentMyApptPage === 1;
    if (btnMyApptsNext) btnMyApptsNext.disabled = currentMyApptPage === totalPages;

    bindMeetLinkButtons();
  };

  // Render Table 2: Appointment History (Past: date & time <= now)
  const renderAppointmentHistoryTable = () => {
    const tableBody = document.getElementById('appointmentHistoryTableBody');
    if (!tableBody) return;

    if (!loadedHistoryAppts || loadedHistoryAppts.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 32px; color: #64748b;">
            No past consultation history found.
          </td>
        </tr>
      `;
      if (historyCountText) historyCountText.textContent = 'Showing 0 items';
      if (historyPageLabel) historyPageLabel.textContent = '1 of 1';
      if (btnHistoryPrev) btnHistoryPrev.disabled = true;
      if (btnHistoryNext) btnHistoryNext.disabled = true;
      return;
    }

    const totalItems = loadedHistoryAppts.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
    if (currentHistoryPage > totalPages) currentHistoryPage = totalPages;
    if (currentHistoryPage < 1) currentHistoryPage = 1;

    const startIdx = (currentHistoryPage - 1) * itemsPerPage;
    const endIdx = Math.min(startIdx + itemsPerPage, totalItems);
    const pageItems = loadedHistoryAppts.slice(startIdx, endIdx);

    tableBody.innerHTML = pageItems.map(appt => {
      const apptId = appt.appointment_id || ('ABC-' + String(appt.id).padStart(3, '0'));
      const dateFormatted = formatDate(appt.appointment_date);
      const timeVal = appt.appointment_time || '3:00 PM';
      const doctorName = appt.doctor_name || 'Dr. Rohit Mehra';
      const agendaText = appt.agenda || appt.service_type || 'Ayurvedic consultation and pulse diagnostics review';
      const durationVal = formatDuration(appt.duration);
      const prescriptionData = typeof appt.prescription === 'object' ? JSON.stringify(appt.prescription) : (appt.prescription || '');

      return `
        <tr>
          <td class="table-id-cell">${escapeHtml(apptId)}</td>
          <td class="table-date-cell">${escapeHtml(dateFormatted)}</td>
          <td class="table-time-cell">${escapeHtml(timeVal)}</td>
          <td class="table-doctor-cell">${escapeHtml(doctorName)}</td>
          <td class="table-agenda-cell" title="${escapeHtml(agendaText)}">${escapeHtml(agendaText)}</td>
          <td class="table-duration-cell">${escapeHtml(durationVal)}</td>
          <td class="table-action-cell">
            <button 
              type="button" 
              class="btn-view-history" 
              data-db-id="${escapeHtml(appt.id)}"
              data-id="${escapeHtml(apptId)}" 
              data-date="${escapeHtml(dateFormatted)}" 
              data-time="${escapeHtml(timeVal)}" 
              data-doctor="${escapeHtml(doctorName)}" 
              data-duration="${escapeHtml(durationVal)}" 
              data-agenda="${escapeHtml(agendaText)}"
              data-patient="${escapeHtml(appt.patient_name || 'Rahul Sharma')}"
              data-prescription="${escapeHtml(prescriptionData)}"
              data-notes="${escapeHtml(appt.notes || '')}"
            >
              <span>View</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    if (historyPageLabel) historyPageLabel.textContent = `${currentHistoryPage} of ${totalPages}`;
    if (historyCountText) historyCountText.textContent = `Showing ${startIdx + 1} to ${endIdx} of ${totalItems} items`;
    if (btnHistoryPrev) btnHistoryPrev.disabled = currentHistoryPage === 1;
    if (btnHistoryNext) btnHistoryNext.disabled = currentHistoryPage === totalPages;

    bindViewHistoryButtons();
  };

  const loadAppointmentsFromDB = async () => {
    try {
      const res = await fetch('../api/consultations.php');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          loadedMyAppts = Array.isArray(data.my_appointments) ? data.my_appointments : [];
          loadedHistoryAppts = Array.isArray(data.history_appointments) ? data.history_appointments : [];
          
          currentMyApptPage = 1;
          currentHistoryPage = 1;
          if (consultSearchInput && consultSearchInput.value.trim()) {
            applySearchFilter();
          } else {
            renderMyAppointmentsTable();
            renderAppointmentHistoryTable();
          }
        }
      }
    } catch (err) {
      console.warn('Notice: Error fetching appointments from DB:', err);
    }
  };

  // Fetch appointments dynamically from database on load
  loadAppointmentsFromDB();

  // Initial binding for static elements if any
  bindMeetLinkButtons();
  bindViewHistoryButtons();

  // Pagination Event Listeners
  if (btnMyApptsPrev) {
    btnMyApptsPrev.addEventListener('click', () => {
      if (currentMyApptPage > 1) {
        currentMyApptPage--;
        renderMyAppointmentsTable();
        showToast(`Loaded Page ${currentMyApptPage}`);
      }
    });
  }

  if (btnMyApptsNext) {
    btnMyApptsNext.addEventListener('click', () => {
      const totalPages = Math.max(1, Math.ceil((loadedMyAppts.length || 1) / itemsPerPage));
      if (currentMyApptPage < totalPages) {
        currentMyApptPage++;
        renderMyAppointmentsTable();
        showToast(`Loaded Page ${currentMyApptPage}`);
      }
    });
  }

  if (btnHistoryPrev) {
    btnHistoryPrev.addEventListener('click', () => {
      if (currentHistoryPage > 1) {
        currentHistoryPage--;
        renderAppointmentHistoryTable();
        showToast(`Loaded History Page ${currentHistoryPage}`);
      }
    });
  }

  if (btnHistoryNext) {
    btnHistoryNext.addEventListener('click', () => {
      const totalPages = Math.max(1, Math.ceil((loadedHistoryAppts.length || 1) / itemsPerPage));
      if (currentHistoryPage < totalPages) {
        currentHistoryPage++;
        renderAppointmentHistoryTable();
        showToast(`Loaded History Page ${currentHistoryPage}`);
      }
    });
  }

  // ========================================================
  // 4. MODALS & PRESCRIPTION EVENT HANDLERS
  // ========================================================
  if (closeViewModalBtn) {
    closeViewModalBtn.addEventListener('click', () => {
      if (viewAppointmentModal) {
        viewAppointmentModal.classList.remove('active');
        viewAppointmentModal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
      }
    });
  }

  // Helper to render prescription data into Prescription Modal
  const renderDynamicPrescriptionModal = (rx) => {
    if (!rx) return;

    const rxDate = document.getElementById('rxDate');
    const rxTime = document.getElementById('rxTime');
    const rxPatientName = document.getElementById('rxPatientName');
    const rxGender = document.getElementById('rxGender');
    const rxAge = document.getElementById('rxAge');
    const rxMedHistory = document.getElementById('rxMedHistory');
    const rxSymptoms = document.getElementById('rxSymptoms');
    const rxDiagnosis = document.getElementById('rxDiagnosis');
    const rxFindings = document.getElementById('rxFindings');
    const rxNotes = document.getElementById('rxNotes');
    const rxReferralDoctor = document.getElementById('rxReferralDoctor');
    const rxReferralSpecialty = document.getElementById('rxReferralSpecialty');
    const rxContactText = document.getElementById('rxContactText');

    if (rxDate) rxDate.textContent = formatDate(rx.date || rx.prescription_date) || rx.date || '2 Sept 2026';
    if (rxTime) rxTime.textContent = rx.time || rx.prescription_time || '07:00 - 07:45 PM';
    if (rxPatientName) rxPatientName.textContent = rx.patient_name || 'Rahul Sharma';
    if (rxGender) rxGender.textContent = rx.gender || 'Male';
    if (rxAge) rxAge.textContent = rx.age || '34';

    if (rxMedHistory) rxMedHistory.textContent = rx.medical_history || 'No Known Significant Medical History';
    if (rxSymptoms) rxSymptoms.textContent = rx.symptoms || 'Constipation (Severity : Moderate)';
    if (rxDiagnosis) rxDiagnosis.textContent = rx.diagnosis || 'Migraine (Duration : 3 months)';
    if (rxFindings) rxFindings.textContent = rx.examination_findings || 'Abdomen Feels Distended';
    if (rxNotes) rxNotes.textContent = rx.notes || 'Gandhush ( Cow Ghee + Triphala Powder )';

    if (rxReferralDoctor) rxReferralDoctor.textContent = rx.referred_doctor || rx.doctor_name || 'Dr. Ananya Prasad';
    if (rxReferralSpecialty) rxReferralSpecialty.textContent = rx.referred_specialty || rx.doctor_specialty || 'Ayurvedic Medicine';
    if (rxContactText) {
      const phone = rx.support_phone || rx.doctor_phone || '+91 7896543210';
      const email = rx.support_email || rx.doctor_email || 'care@ocayur.com';
      rxContactText.innerHTML = `${escapeHtml(phone)} &nbsp;|&nbsp; ${escapeHtml(email)}`;
    }

    // Render Medication Columns/Grid dynamically from database
    const rxMedGrid = document.getElementById('rxMedicationGrid');
    if (rxMedGrid) {
      const meds = Array.isArray(rx.medications) && rx.medications.length > 0 ? rx.medications : [
        {
          medication: 'NULL',
          dose: '1 TABLET',
          frequency: '1-0-1 BEFORE MEAL',
          duration: '10 DAYS',
          remarks: 'TAKE 1 TABLET - TWICE A DAY, BEFORE BREAKFAST AND BEFORE DINNER FOR 10 DAYS'
        }
      ];

      rxMedGrid.innerHTML = meds.map(med => {
        const medNameHtml = escapeHtml(med.medication || 'NULL').replace(/\((.*?)\)/, '<br>($1)');
        const freqHtml = escapeHtml(med.frequency || '1-0-1 BEFORE MEAL').replace('BEFORE', '<br>BEFORE');
        return `
          <div class="rx-med-col">
            <p class="rx-med-col-header">Medication:</p>
            <p class="rx-med-col-val">${medNameHtml}</p>
          </div>
          <div class="rx-med-col">
            <p class="rx-med-col-header">Dose:</p>
            <p class="rx-med-col-val">${escapeHtml(med.dose || '1 TABLET')}</p>
          </div>
          <div class="rx-med-col">
            <p class="rx-med-col-header">Frequency:</p>
            <p class="rx-med-col-val">${freqHtml}</p>
          </div>
          <div class="rx-med-col">
            <p class="rx-med-col-header">Duration:</p>
            <p class="rx-med-col-val">${escapeHtml(med.duration || '10 DAYS')}</p>
          </div>
          <div class="rx-med-col">
            <p class="rx-med-col-header">Remarks:</p>
            <p class="rx-med-col-val">${escapeHtml(med.remarks || 'TAKE 1 TABLET - TWICE A DAY, BEFORE BREAKFAST AND BEFORE DINNER FOR 10 DAYS')}</p>
          </div>
        `;
      }).join('');
    }
  };

  if (btnOpenPrescriptionModal) {
    btnOpenPrescriptionModal.addEventListener('click', async (e) => {
      e.preventDefault();
      // Hide view modal & show prescription modal
      if (viewAppointmentModal) {
        viewAppointmentModal.classList.remove('active');
        viewAppointmentModal.setAttribute('aria-hidden', 'true');
      }

      if (activeSelectedAppt) {
        const appt = activeSelectedAppt;

        // If active appointment already has full preloaded prescription_data from DB
        if (appt.prescription_data) {
          renderDynamicPrescriptionModal(appt.prescription_data);
        } else {
          // Parse embedded JSON prescription or fallback
          let parsedRx = null;
          try {
            if (appt.prescription && typeof appt.prescription === 'object') {
              parsedRx = appt.prescription;
            } else if (appt.prescription && typeof appt.prescription === 'string' && appt.prescription.startsWith('{')) {
              parsedRx = JSON.parse(appt.prescription);
            }
          } catch (err) {}

          if (parsedRx) {
            renderDynamicPrescriptionModal(parsedRx);
          } else {
            // Render baseline from appointment object
            renderDynamicPrescriptionModal({
              date: appt.appointment_date || appt.date,
              time: appt.appointment_time || appt.time,
              patient_name: appt.patient_name || appt.patient,
              gender: appt.gender || 'Male',
              age: appt.age || 34,
              medical_history: 'No Known Significant Medical History',
              symptoms: 'Constipation (Severity : Moderate)',
              diagnosis: 'Migraine (Duration : 3 months)',
              examination_findings: 'Abdomen Feels Distended',
              notes: appt.notes || 'Gandhush ( Cow Ghee + Triphala Powder )',
              referred_doctor: appt.doctor_name || appt.doctor || 'Dr. Ananya Prasad',
              referred_specialty: 'Ayurvedic Medicine',
              medications: [
                {
                  medication: appt.prescription && !appt.prescription.startsWith('{') ? appt.prescription : 'NULL',
                  dose: '1 TABLET',
                  frequency: '1-0-1 BEFORE MEAL',
                  duration: '10 DAYS',
                  remarks: 'TAKE 1 TABLET - TWICE A DAY, BEFORE BREAKFAST AND BEFORE DINNER FOR 10 DAYS'
                }
              ]
            });
          }
        }

        // Also asynchronously fetch from DB endpoint for live verification
        if (appt.id) {
          try {
            const rxRes = await fetch(`../api/consultations.php?action=prescription&appointment_id=${appt.id}`);
            if (rxRes.ok) {
              const rxJson = await rxRes.json();
              if (rxJson.success && rxJson.prescription) {
                appt.prescription_data = rxJson.prescription;
                renderDynamicPrescriptionModal(rxJson.prescription);
              }
            }
          } catch (fetchErr) {
            console.warn('Notice: Background prescription fetch err:', fetchErr);
          }
        }
      }

      if (prescriptionModal) {
        prescriptionModal.classList.add('active');
        prescriptionModal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
      }
    });
  }

  if (closePrescriptionModalBtn) {
    closePrescriptionModalBtn.addEventListener('click', () => {
      if (prescriptionModal) {
        prescriptionModal.classList.remove('active');
        prescriptionModal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
      }
    });
  }

  if (btnPrintPrescription) {
    btnPrintPrescription.addEventListener('click', () => {
      window.print();
    });
  }

  // ========================================================
  // 6. MODAL 3: BOOK CONSULTATION MODAL & DYNAMIC DOCTOR FETCH
  // ========================================================
  // Time conversion & clock helpers
  const parseTimeToMinutes = (tStr) => {
    if (!tStr) return null;
    const trimmed = tStr.trim();
    const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([APap][Mm])?$/i);
    if (!match) return null;
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const meridian = (match[3] || '').toUpperCase();
    if (meridian === 'PM' && hours < 12) hours += 12;
    if (meridian === 'AM' && hours === 12) hours = 0;
    return hours * 60 + minutes;
  };

  const minutesToFormattedTime = (totalMinutes) => {
    if (totalMinutes === null || totalMinutes === undefined || isNaN(totalMinutes)) return '';
    const normalized = ((totalMinutes % 1440) + 1440) % 1440;
    let h = Math.floor(normalized / 60);
    const m = normalized % 60;
    const meridian = h >= 12 ? 'PM' : 'AM';
    let displayH = h % 12;
    if (displayH === 0) displayH = 12;
    const hh = String(displayH).padStart(2, '0');
    const mm = String(m).padStart(2, '0');
    return `${hh}:${mm} ${meridian}`;
  };

  // Doctor Schedule & Availability Mapping (in minutes from midnight)
  const doctorSchedules = {
    1: [ // Dr. Nidhi Jha: 08:00 AM - 01:00 PM, 05:00 PM - 09:00 PM
      { start: 480, end: 780, text: '08:00 AM - 01:00 PM' },
      { start: 1020, end: 1260, text: '05:00 PM - 09:00 PM' }
    ],
    2: [ // Dr. Rohit Mehra: 10:00 AM - 02:00 PM, 04:00 PM - 08:00 PM
      { start: 600, end: 840, text: '10:00 AM - 02:00 PM' },
      { start: 960, end: 1200, text: '04:00 PM - 08:00 PM' }
    ],
    3: [ // Dr. Priya Patel: 08:00 AM - 02:00 PM, 06:00 PM - 09:00 PM
      { start: 480, end: 840, text: '08:00 AM - 02:00 PM' },
      { start: 1080, end: 1260, text: '06:00 PM - 09:00 PM' }
    ],
    4: [ // Dr. Ankit Verma: 12:00 PM - 06:00 PM
      { start: 720, end: 1080, text: '12:00 PM - 06:00 PM' }
    ],
    5: [ // Dr. Sneha Kulkarni: 03:00 PM - 09:00 PM
      { start: 900, end: 1260, text: '03:00 PM - 09:00 PM' }
    ]
  };

  const isDoctorAvailableAt = (doc, timeStr, dateStr = '') => {
    if (!timeStr) return true; // If no time chosen yet, all active doctors shown
    const timeMins = parseTimeToMinutes(timeStr);
    if (timeMins === null) return true;

    // Check doctor shift schedule
    const docId = parseInt(doc.id, 10);
    const schedule = doc.schedule || doctorSchedules[docId] || [
      { start: 540, end: 1140, text: '09:00 AM - 07:00 PM' }
    ];

    const inShift = schedule.some(slot => {
      const s = slot.start_min !== undefined ? slot.start_min : slot.start;
      const e = slot.end_min !== undefined ? slot.end_min : slot.end;
      return timeMins >= s && timeMins < e;
    });
    if (!inShift) return false;

    // Check for booked appointment conflicts if date is selected
    if (dateStr && Array.isArray(loadedMyAppts)) {
      const isBooked = loadedMyAppts.some(appt => {
        if (!appt) return false;
        const apptDate = appt.appointment_date || appt.date || '';
        const apptDoc = appt.doctor_name || appt.doctor || '';
        const apptTime = appt.appointment_time || appt.time || '';
        if (apptDate === dateStr && (apptDoc === doc.name || apptDoc.includes(doc.name))) {
          const apptStart = parseTimeToMinutes(apptTime.split('-')[0]);
          if (apptStart !== null && Math.abs(apptStart - timeMins) < 45) {
            return true;
          }
        }
        return false;
      });
      if (isBooked) return false;
    }

    return true;
  };

  let activeDoctorsList = [];

  const renderDoctorSelectOptions = (doctors, preservedDoctor = '', placeholderText = 'Select Doctor') => {
    if (!consultDoctor) return;

    let hasPreservedMatch = false;
    const optionsHtml = doctors.map(doc => {
      const isSelected = preservedDoctor && doc.name === preservedDoctor;
      if (isSelected) hasPreservedMatch = true;
      return `<option value="${escapeHtml(doc.name)}" data-id="${doc.id}" data-role="${escapeHtml(doc.role || doc.expertise || 'Ayurveda Physician')}" data-initials="${escapeHtml(doc.initials || 'DR')}" ${isSelected ? 'selected' : ''}>${escapeHtml(doc.name)}${doc.role ? (' - ' + escapeHtml(doc.role)) : ''}</option>`;
    }).join('');

    consultDoctor.innerHTML = `<option value="" disabled ${!hasPreservedMatch ? 'selected' : ''}>${placeholderText}</option>` + optionsHtml;

    if (hasPreservedMatch) {
      consultDoctor.value = preservedDoctor;
    } else {
      consultDoctor.selectedIndex = 0;
    }
  };

  const updateDoctorsForStartTime = (selectedTime, selectedDate) => {
    if (!consultDoctor) return;

    const time = selectedTime !== undefined ? selectedTime : (consultStartTime?.value.trim() || '');
    const date = selectedDate !== undefined ? selectedDate : (consultDate?.value.trim() || '');
    const currentSelected = consultDoctor.value;

    if (!time) {
      // If no start time is selected, display all active doctors
      renderDoctorSelectOptions(activeDoctorsList, currentSelected, 'Select Doctor');
      return;
    }

    const availableDocs = activeDoctorsList.filter(doc => isDoctorAvailableAt(doc, time, date));

    if (availableDocs.length === 0) {
      consultDoctor.innerHTML = `<option value="" disabled selected>No doctors available at ${escapeHtml(time)}</option>`;
      consultDoctor.selectedIndex = 0;
    } else {
      renderDoctorSelectOptions(availableDocs, currentSelected, `Select Doctor (${availableDocs.length} available)`);
    }
  };

  // Fetch active doctors dynamically from database schema
  const fetchDoctorsFromDB = async () => {
    try {
      const res = await fetch('../api/doctors.php');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.doctors) && data.doctors.length > 0) {
          activeDoctorsList = data.doctors;
          updateDoctorsForStartTime(consultStartTime?.value.trim() || '', consultDate?.value.trim() || '');
          return;
        }
      }
    } catch (e) {
      console.warn('Notice: Backend fetch doctors error:', e);
    }
    // Fallback if database request had an issue
    activeDoctorsList = [
      { id: 1, name: 'Dr. Nidhi Jha', role: 'Ayurveda Physician (Pediatrics & Gynecology)', initials: 'NJ' },
      { id: 2, name: 'Dr. Rohit Mehra', role: 'Physiotherapist (Pune)', initials: 'RM' },
      { id: 3, name: 'Dr. Priya Patel', role: 'Panchakarma Specialist', initials: 'PP' },
      { id: 4, name: 'Dr. Ankit Verma', role: 'Ayurvedic Consultant (Chronic Disease Management)', initials: 'AV' },
      { id: 5, name: 'Dr. Sneha Kulkarni', role: 'Neuro-Physiotherapist (Neurological Rehab)', initials: 'SK' }
    ];
    updateDoctorsForStartTime(consultStartTime?.value.trim() || '', consultDate?.value.trim() || '');
  };

  fetchDoctorsFromDB();

  // Form Input Restrictions: disallow numbers in Full Name & restrict Mobile to 10 digits
  if (consultName) {
    consultName.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/[0-9]/g, '');
    });
  }

  if (consultMobile) {
    consultMobile.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
    });
  }

  // Calendar Picker Integration
  if (nativeDatePicker) {
    const todayISO = new Date().toISOString().split('T')[0];
    nativeDatePicker.setAttribute('min', todayISO);
  }

  if (btnDateCalendar && nativeDatePicker && consultDate) {
    btnDateCalendar.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        if (nativeDatePicker.showPicker) {
          nativeDatePicker.showPicker();
        } else {
          nativeDatePicker.focus();
        }
      } catch (err) {
        nativeDatePicker.focus();
      }
    });

    consultDate.addEventListener('click', () => {
      if (!consultDate.value) {
        try {
          if (nativeDatePicker.showPicker) nativeDatePicker.showPicker();
        } catch (err) {}
      }
    });

    nativeDatePicker.addEventListener('change', () => {
      if (nativeDatePicker.value) {
        const parts = nativeDatePicker.value.split('-');
        if (parts.length === 3) {
          const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
          const formatted = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
          consultDate.value = formatted;
        } else {
          consultDate.value = nativeDatePicker.value;
        }
      }
    });
  }

  // Clock Picker Helpers

  const parseTimeComponents = (tStr, defaultHour = '07', defaultMin = '00', defaultPeriod = 'PM') => {
    if (!tStr) return { hour: defaultHour, minute: defaultMin, period: defaultPeriod };
    const match = tStr.trim().match(/^(\d{1,2}):(\d{2})\s*([APap][Mm])?$/i);
    if (!match) return { hour: defaultHour, minute: defaultMin, period: defaultPeriod };
    let h = parseInt(match[1], 10);
    if (h === 0) h = 12;
    const hourStr = String(h).padStart(2, '0');
    const minStr = String(parseInt(match[2], 10)).padStart(2, '0');
    const perStr = (match[3] || 'AM').toUpperCase();
    return { hour: hourStr, minute: minStr, period: perStr };
  };

  const formatDurationLabel = (diffMins) => {
    if (diffMins <= 0) return '';
    if (diffMins < 60) return `+${diffMins}m session`;
    const hrs = Math.floor(diffMins / 60);
    const rem = diffMins % 60;
    return rem === 0 ? `+${hrs}h session` : `+${hrs}h ${rem}m session`;
  };

  const clockHoursList = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
  const clockMinutesList = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];
  const clockPeriodsList = ['AM', 'PM'];

  const renderCompleteClockPicker = (dropdownEl, inputEl, isStartTime = true) => {
    if (!dropdownEl || !inputEl) return;

    const defaultH = isStartTime ? '07' : '07';
    const defaultM = isStartTime ? '00' : '45';
    const defaultP = isStartTime ? 'PM' : 'PM';
    let { hour, minute, period } = parseTimeComponents(inputEl.value, defaultH, defaultM, defaultP);

    // If minute is not exactly in 5-min intervals, find closest
    if (!clockMinutesList.includes(minute)) {
      const minNum = parseInt(minute, 10);
      const rounded = Math.round(minNum / 5) * 5 % 60;
      minute = String(rounded).padStart(2, '0');
    }

    const computeHint = (h, m, p) => {
      const curMins = parseTimeToMinutes(`${h}:${m} ${p}`);
      if (isStartTime) {
        return 'Standard session: 45 min';
      }
      const startMins = parseTimeToMinutes(consultStartTime?.value);
      if (startMins !== null && curMins !== null) {
        if (curMins <= startMins) {
          return '<span class="clock-duration-hint error">Must be after Start Time</span>';
        }
        return `<span class="clock-duration-hint">${formatDurationLabel(curMins - startMins)}</span>`;
      }
      return 'Session end time';
    };

    dropdownEl.innerHTML = `
      <div class="clock-picker-header">
        <span class="clock-header-title">${isStartTime ? 'Start Time' : 'End Time'}</span>
        <div class="clock-digital-display">
          <span class="clock-digit-box clock-hour-disp">${hour}</span>
          <span class="clock-colon">:</span>
          <span class="clock-digit-box clock-min-disp">${minute}</span>
          <span class="clock-period-badge clock-period-disp">${period}</span>
        </div>
      </div>
      <div class="clock-picker-body">
        <div class="clock-col">
          <div class="clock-col-header">Hour</div>
          <div class="clock-col-scroll clock-hours-scroll">
            ${clockHoursList.map(h => `<button type="button" class="clock-unit-btn ${h === hour ? 'active' : ''}" data-unit="hour" data-val="${h}">${h}</button>`).join('')}
          </div>
        </div>
        <div class="clock-col">
          <div class="clock-col-header">Min</div>
          <div class="clock-col-scroll clock-mins-scroll">
            ${clockMinutesList.map(m => `<button type="button" class="clock-unit-btn ${m === minute ? 'active' : ''}" data-unit="minute" data-val="${m}">${m}</button>`).join('')}
          </div>
        </div>
        <div class="clock-col">
          <div class="clock-col-header">Period</div>
          <div class="clock-col-scroll clock-period-scroll">
            ${clockPeriodsList.map(p => `<button type="button" class="clock-unit-btn ${p === period ? 'active' : ''}" data-unit="period" data-val="${p}">${p}</button>`).join('')}
          </div>
        </div>
      </div>
      <div class="clock-picker-footer">
        <div class="clock-hint-wrap">${computeHint(hour, minute, period)}</div>
        <button type="button" class="clock-btn-apply">Set Time</button>
      </div>
    `;

    // Auto-scroll hour and minute lists to active items
    setTimeout(() => {
      const activeHour = dropdownEl.querySelector('.clock-hours-scroll .clock-unit-btn.active');
      const activeMin = dropdownEl.querySelector('.clock-mins-scroll .clock-unit-btn.active');
      if (activeHour) activeHour.scrollIntoView({ block: 'nearest' });
      if (activeMin) activeMin.scrollIntoView({ block: 'nearest' });
    }, 10);
  };

  const setupTimePicker = (inputEl, btnEl, dropdownEl, isStartTime = true) => {
    if (!inputEl || !btnEl || !dropdownEl) return;

    const toggleDropdown = (show) => {
      const willShow = show !== undefined ? show : !dropdownEl.classList.contains('active');
      if (willShow) {
        document.querySelectorAll('.time-picker-dropdown.active').forEach(d => {
          if (d !== dropdownEl) d.classList.remove('active');
        });
        renderCompleteClockPicker(dropdownEl, inputEl, isStartTime);
        dropdownEl.classList.add('active');
      } else {
        dropdownEl.classList.remove('active');
      }
    };

    btnEl.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleDropdown();
    });

    inputEl.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDropdown(true);
    });

    inputEl.addEventListener('focus', () => {
      toggleDropdown(true);
    });

    inputEl.addEventListener('change', () => {
      const parsed = parseTimeToMinutes(inputEl.value);
      if (parsed !== null) {
        inputEl.value = minutesToFormattedTime(parsed);
      }
      if (isStartTime) {
        updateDoctorsForStartTime(inputEl.value, consultDate?.value.trim());
      }
      if (isStartTime && consultEndTime) {
        const sMins = parseTimeToMinutes(inputEl.value);
        const eMins = parseTimeToMinutes(consultEndTime.value);
        if (sMins !== null && (eMins === null || eMins <= sMins)) {
          consultEndTime.value = minutesToFormattedTime(sMins + 45);
        }
      }
    });

    inputEl.addEventListener('input', () => {
      if (isStartTime) {
        updateDoctorsForStartTime(inputEl.value, consultDate?.value.trim());
      }
    });

    dropdownEl.addEventListener('click', (e) => {
      e.stopPropagation();

      // Handle Set Time button click
      const applyBtn = e.target.closest('.clock-btn-apply');
      if (applyBtn) {
        toggleDropdown(false);
        if (isStartTime) {
          updateDoctorsForStartTime(inputEl.value, consultDate?.value.trim());
        }
        return;
      }

      // Handle Hour / Minute / Period unit button click
      const unitBtn = e.target.closest('.clock-unit-btn');
      if (!unitBtn) return;

      const unit = unitBtn.getAttribute('data-unit');
      const val = unitBtn.getAttribute('data-val');
      let { hour, minute, period } = parseTimeComponents(inputEl.value, isStartTime ? '07' : '07', isStartTime ? '00' : '45', 'PM');

      if (unit === 'hour') hour = val;
      if (unit === 'minute') minute = val;
      if (unit === 'period') period = val;

      // Update active classes within column
      const scrollParent = unitBtn.closest('.clock-col-scroll');
      if (scrollParent) {
        scrollParent.querySelectorAll('.clock-unit-btn').forEach(btn => btn.classList.remove('active'));
        unitBtn.classList.add('active');
      }

      // Update digital display
      const hourDisp = dropdownEl.querySelector('.clock-hour-disp');
      const minDisp = dropdownEl.querySelector('.clock-min-disp');
      const periodDisp = dropdownEl.querySelector('.clock-period-disp');
      if (hourDisp) hourDisp.textContent = hour;
      if (minDisp) minDisp.textContent = minute;
      if (periodDisp) periodDisp.textContent = period;

      // Format formatted time string
      const formatted = `${hour}:${minute} ${period}`;
      inputEl.value = formatted;

      if (isStartTime) {
        updateDoctorsForStartTime(formatted, consultDate?.value.trim());
      }

      // Update hint text in footer
      const hintWrap = dropdownEl.querySelector('.clock-hint-wrap');
      if (hintWrap) {
        const curMins = parseTimeToMinutes(formatted);
        if (isStartTime) {
          hintWrap.innerHTML = '<span class="clock-duration-hint">Standard session: 45 min</span>';
        } else {
          const startMins = parseTimeToMinutes(consultStartTime?.value);
          if (startMins !== null && curMins !== null) {
            if (curMins <= startMins) {
              hintWrap.innerHTML = '<span class="clock-duration-hint error">Must be after Start Time</span>';
            } else {
              hintWrap.innerHTML = `<span class="clock-duration-hint">${formatDurationLabel(curMins - startMins)}</span>`;
            }
          } else {
            hintWrap.innerHTML = '<span class="clock-duration-hint">Session end time</span>';
          }
        }
      }

      // If choosing Start Time, automatically calculate and pre-fill End Time = Start Time + 45 mins
      if (isStartTime) {
        const sMins = parseTimeToMinutes(formatted);
        const eMins = parseTimeToMinutes(consultEndTime?.value);
        if (sMins !== null && (!consultEndTime?.value || eMins === null || eMins <= sMins)) {
          const suggestedEnd = sMins + 45;
          if (consultEndTime) consultEndTime.value = minutesToFormattedTime(suggestedEnd);
        }
      }
    });
  };

  setupTimePicker(consultStartTime, btnStartTimeClock, startTimeDropdown, true);
  if (consultEndTime && btnEndTimeClock && endTimeDropdown) {
    setupTimePicker(consultEndTime, btnEndTimeClock, endTimeDropdown, false);
  }

  if (consultDate) {
    consultDate.addEventListener('change', () => {
      if (consultStartTime?.value) {
        updateDoctorsForStartTime(consultStartTime.value, consultDate.value.trim());
      }
    });
  }

  // Close time dropdowns when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.time-picker-container')) {
      document.querySelectorAll('.time-picker-dropdown.active').forEach(d => d.classList.remove('active'));
    }
  });

  // Open booking modal ensuring user name and phone number are automatically pre-filled and editable
  const openBookingModal = () => {
    if (!consultationModal) return;

    // Reset all form inputs to blank
    if (consultationBookingForm) {
      consultationBookingForm.reset();
    }

    // Auto pre-fill authenticated patient name and mobile number (both remain editable)
    let prefillName = '';
    let prefillPhone = '';
    try {
      const storedPatient = JSON.parse((localStorage.getItem('ocayur_patient') || localStorage.getItem('panchved_patient')) || 'null');
      const storedUser = JSON.parse((localStorage.getItem('ocayur_user') || localStorage.getItem('panchved_user')) || 'null');
      prefillName = storedPatient?.full_name || storedUser?.full_name || document.getElementById('userName')?.textContent?.trim() || 'Rahul Sharma';
      prefillPhone = storedPatient?.phone_number || storedUser?.phone_number || cachedPhone || '9876543210';
    } catch (e) {
      prefillName = document.getElementById('userName')?.textContent?.trim() || 'Rahul Sharma';
      prefillPhone = cachedPhone || '9876543210';
    }
    // Clean phone number to 10 digits
    prefillPhone = String(prefillPhone || '').replace(/\D/g, '');
    if (prefillPhone.length > 10) prefillPhone = prefillPhone.slice(-10);

    if (consultName) {
      consultName.value = prefillName;
      consultName.readOnly = false;
      consultName.disabled = false;
    }
    if (consultMobile) {
      consultMobile.value = prefillPhone;
      consultMobile.readOnly = false;
      consultMobile.disabled = false;
    }

    if (consultEmail) consultEmail.value = '';
    if (consultDate) consultDate.value = '';
    if (consultStartTime) consultStartTime.value = '';
    if (consultEndTime) consultEndTime.value = '';
    if (consultAgenda) consultAgenda.value = '';
    if (nativeDatePicker) nativeDatePicker.value = '';

    // Initialize doctor dropdown (shows all active doctors until a start time is chosen)
    updateDoctorsForStartTime('', '');

    document.querySelectorAll('.time-picker-dropdown.active').forEach(d => d.classList.remove('active'));

    consultationModal.classList.add('active');
    consultationModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    setTimeout(() => (consultDate || consultName)?.focus(), 80);
  };

  const closeBookingModal = () => {
    if (!consultationModal) return;
    consultationModal.classList.remove('active');
    consultationModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    document.querySelectorAll('.time-picker-dropdown.active').forEach(d => d.classList.remove('active'));
  };

  if (btnBookConsultCTA) {
    btnBookConsultCTA.addEventListener('click', (e) => {
      e.preventDefault();
      openBookingModal();
    });
  }

  if (closeConsultationModalBtn) {
    closeConsultationModalBtn.addEventListener('click', () => closeBookingModal());
  }

  // Booking Form Submission -> Redirect to Checkout
  if (consultationBookingForm && submitConsultationBtn) {
    consultationBookingForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const docVal = consultDoctor?.value.trim();
      const name = consultName?.value.trim();
      const mobile = consultMobile?.value.trim();
      const email = consultEmail?.value.trim();
      const date = consultDate?.value.trim();
      const startTime = consultStartTime?.value.trim();
      const agenda = consultAgenda?.value.trim();

      if (!name) {
        showToast('Please enter your full name.', true);
        consultName?.focus();
        return;
      }

      if (/\d/.test(name)) {
        showToast('Full name should not contain numbers.', true);
        consultName?.focus();
        return;
      }

      if (!mobile || mobile.length !== 10) {
        showToast('Please enter a valid 10-digit mobile number.', true);
        consultMobile?.focus();
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email || !emailRegex.test(email)) {
        showToast('Please enter a valid email address.', true);
        consultEmail?.focus();
        return;
      }

      if (!date) {
        showToast('Please select a date for consultation.', true);
        consultDate?.focus();
        return;
      }

      if (!startTime) {
        showToast('Please select a start time.', true);
        consultStartTime?.focus();
        return;
      }

      if (!docVal) {
        const availDocs = activeDoctorsList.filter(d => isDoctorAvailableAt(d, startTime, date));
        if (availDocs.length === 0) {
          showToast('No doctors are available at the selected start time. Please choose another time.', true);
        } else {
          showToast('Please select a doctor.', true);
        }
        consultDoctor?.focus();
        return;
      }

      if (!agenda) {
        showToast('Please enter your complaint for the consultation.', true);
        consultAgenda?.focus();
        return;
      }

      const selectedDocOption = consultDoctor.options[consultDoctor.selectedIndex];
      const doctorName = docVal || 'Dr. Nidhi Jha';
      const doctorRole = selectedDocOption?.getAttribute('data-role') || 'Ayurveda Physician';
      const doctorInitials = selectedDocOption?.getAttribute('data-initials') || 'DR';
      const doctorId = selectedDocOption?.getAttribute('data-id') || '1';

      const startMins = parseTimeToMinutes(startTime);
      const computedEndTime = startMins !== null ? minutesToFormattedTime(startMins + 45) : '';
      const timeFormatted = computedEndTime ? `${startTime} - ${computedEndTime}` : startTime;

      // Save consultation booking info to localStorage
      const bookingData = {
        isConsultationCheckout: true,
        doctorName: doctorName,
        doctorRole: doctorRole,
        doctorInitials: doctorInitials,
        doctorId: doctorId,
        patientName: name,
        patientEmail: email,
        patientPhone: mobile,
        date: date,
        startTime: startTime,
        endTime: computedEndTime,
        time: timeFormatted,
        slot: timeFormatted,
        complaint: agenda,
        agenda: agenda || `Ayurvedic consultation with ${doctorName}`,
        fee: '₹500.00'
      };

      try {
        localStorage.setItem('ocayur_consultation_booking', JSON.stringify(bookingData));
        localStorage.setItem('ocayur_checkout_type', 'consultation');
      } catch (err) {
        console.warn('localStorage disabled', err);
      }

      const originalHtml = submitConsultationBtn.innerHTML;
      submitConsultationBtn.disabled = true;
      submitConsultationBtn.style.opacity = '0.85';
      submitConsultationBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="animation: spin 0.8s linear infinite;">
          <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)"></circle>
          <path d="M12 2a10 10 0 0 1 10 10" stroke="#ffffff"></path>
        </svg>
        <span>Redirecting to Checkout...</span>
      `;

      setTimeout(() => {
        submitConsultationBtn.disabled = false;
        submitConsultationBtn.style.opacity = '1';
        submitConsultationBtn.innerHTML = originalHtml;
        closeBookingModal();
        window.location.href = 'consultation-checkout.html';
      }, 500);
    });
  }

  // Backdrop clicks for closing modals
  [viewAppointmentModal, prescriptionModal, consultationModal].forEach(modal => {
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          closeAllModals();
        }
      });
    }
  });

  // Global ESC Key Close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllModals();
    }
  });

});

