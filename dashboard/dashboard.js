/**
 * Panchved Patient Portal - Dashboard Engine
 * Dynamic PHP & MySQL Database Backend Integration
 * Full Dynamic Cards, Metrics, Graphs & Notifications
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

  // Navigation & DOM Elements
  const mobileMenuToggle = document.getElementById('mobileMenuToggle');
  const dashboardSidebar = document.getElementById('dashboardSidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  const addReadingBtn = document.getElementById('addReadingBtn');
  const readingModalOverlay = document.getElementById('readingModalOverlay');
  const closeReadingModalBtn = document.getElementById('closeReadingModalBtn');
  const cancelReadingBtn = document.getElementById('cancelReadingBtn');
  const readingForm = document.getElementById('readingForm');
  const viewDietBtn = document.getElementById('viewDietBtn');
  const dietModalOverlay = document.getElementById('dietModalOverlay');
  const closeDietModalBtn = document.getElementById('closeDietModalBtn');
  const dietPlanPara1 = document.getElementById('dietPlanPara1');
  const dietPlanPara2 = document.getElementById('dietPlanPara2');
  const logoutBtn = document.getElementById('logoutBtn');

  // Memory Stores
  let cachedDashboardData = null;
  let cachedDietPlan = null;
  const activeTimeframes = {
    weight: '6w',
    abdomen: '6w',
    bp: '6w',
    sugar: '6w'
  };

  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMsg');

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

  // Time-aware greeting
  const getTimeGreeting = (fullName) => {
    const hour = new Date().getHours();
    let period = 'Good Morning';
    if (hour >= 12 && hour < 17) {
      period = 'Good Afternoon';
    } else if (hour >= 17) {
      period = 'Good Evening';
    }
    return `${period} ${fullName}!`;
  };

  // Update UI with authenticated patient details
  const applyDashboardPatient = (user, patient) => {
    const fullName = patient?.full_name || user?.full_name || 'Patient';
    const patientId = patient?.patient_id || ('P00' + (user?.id || 1));

    if (fullName) {
      const userGreeting = document.getElementById('userGreeting');
      if (userGreeting) userGreeting.textContent = getTimeGreeting(fullName);
      const userName = document.getElementById('userName');
      if (userName) userName.textContent = fullName;
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

  // Animated Counter on Metric Cards
  const animateDashboardMetrics = () => {
    document.querySelectorAll('.stat-card-value').forEach(el => {
      const target = parseInt(el.getAttribute('data-target') || '0', 10);
      if (isNaN(target)) return;
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

  // Render Dynamic Bar Chart for a specific metric and timeframe
  const renderChart = (metricKey, timeframe = '6w') => {
    const container = document.getElementById(`${metricKey}BarsArea`);
    if (!container) return;

    const metricGraph = cachedDashboardData?.graphs?.[metricKey];
    if (!metricGraph) {
      container.innerHTML = '<div class="chart-empty-msg">No data available</div>';
      return;
    }

    const colorClass = metricGraph.color_class || 'bar-teal';
    const dataset = metricGraph.timeframes?.[timeframe] || metricGraph.timeframes?.['6w'] || [];

    if (!Array.isArray(dataset) || dataset.length === 0) {
      container.innerHTML = '<div class="chart-empty-msg">No readings recorded for this timeframe</div>';
      return;
    }

    container.innerHTML = dataset.map(item => `
      <div class="chart-col" title="${item.date_label || ''}: ${item.val_label || ''} ${metricGraph.unit || ''}">
        <span class="bar-val-label">${item.val_label}</span>
        <div class="bar-track">
          <div class="bar-fill ${colorClass}" style="height: ${item.height_percent || 0}%;"></div>
        </div>
        <span class="bar-date-label">${item.date_label || ''}</span>
      </div>
    `).join('');
  };

  // Render All 4 Health Metric Charts
  const renderAllCharts = () => {
    ['weight', 'abdomen', 'bp', 'sugar'].forEach(metricKey => {
      renderChart(metricKey, activeTimeframes[metricKey] || '6w');
    });
  };

  // Render Dynamic Notifications
  const renderNotifications = (notifications) => {
    const notifContainer = document.getElementById('notificationsList');
    if (!notifContainer) return;

    if (!notifications || !Array.isArray(notifications) || notifications.length === 0) {
      notifContainer.innerHTML = `
        <div class="chart-empty-msg" style="padding: 24px 0; font-size: 13.5px;">
          No new notifications at this time.
        </div>
      `;
      return;
    }

    notifContainer.innerHTML = notifications.map(n => `
      <div class="notification-item">
        <div class="notification-icon-badge" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
        </div>
        <div class="notification-content">
          <h3 class="notification-title">${n.title || 'Appointment Scheduled'}</h3>
          <p class="notification-time">${n.description ? (n.description + ' &bull; ') : ''}${n.datetime || 'Today'}</p>
        </div>
        <span class="notification-ago">${n.time_ago || 'Recent'}</span>
      </div>
    `).join('');
  };

  // Render My Package Card Details
  const renderMyPackage = (pkgData) => {
    const nameEl = document.getElementById('myPackageName');
    const startEl = document.getElementById('myPackageStartDate');
    const fillEl = document.getElementById('myPackageProgressFill');
    const percentEl = document.getElementById('myPackageProgressPercent');
    const weekEl = document.getElementById('myPackageWeekInfo');

    if (!pkgData) {
      if (nameEl) nameEl.textContent = 'No Active Package';
      if (startEl) startEl.textContent = 'Explore our tailored wellness packages';
      if (fillEl) fillEl.style.width = '0%';
      if (percentEl) percentEl.textContent = '0 %';
      if (weekEl) weekEl.textContent = 'Enroll today';
      return;
    }

    if (nameEl) nameEl.textContent = pkgData.package_name || 'Gut Healing Package';
    if (startEl) startEl.textContent = pkgData.start_date ? `Started on ${pkgData.start_date}` : 'Ongoing Health Program';
    const percent = pkgData.progress_percent !== undefined ? pkgData.progress_percent : 50;
    if (fillEl) fillEl.style.width = `${percent}%`;
    if (percentEl) percentEl.textContent = pkgData.progress_text || `${percent} %`;
    if (weekEl) weekEl.textContent = pkgData.week_info || 'Week 2 of 4';
  };

  // Step 1: Populate from cached session immediately
  let cachedPhone = '';
  let cachedPatientId = '';
  try {
    const storedUser = JSON.parse(localStorage.getItem('panchved_user') || 'null');
    const storedPatient = JSON.parse(localStorage.getItem('panchved_patient') || 'null');
    if (storedUser || storedPatient) {
      applyDashboardPatient(storedUser, storedPatient);
      cachedPhone = storedPatient?.phone_number || storedUser?.phone_number || '';
      cachedPatientId = storedPatient?.patient_id || '';
    }
  } catch (err) {
    console.warn('Unable to load stored dashboard session', err);
  }

  // Step 2: Dynamically fetch fresh data from database via PHP (api/dashboard.php)
  const fetchDashboardData = async () => {
    try {
      const params = new URLSearchParams();
      if (cachedPhone) params.append('phone', cachedPhone);
      if (cachedPatientId) params.append('patient_id', cachedPatientId);

      const queryUrl = '../api/dashboard.php' + (params.toString() ? `?${params.toString()}` : '');
      const res = await fetch(queryUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          cachedDashboardData = data;

          // 1. Patient & Header
          if (data.patient) {
            applyDashboardPatient(null, data.patient);
            try { localStorage.setItem('panchved_patient', JSON.stringify(data.patient)); } catch (e) {}
          }

          // 2. Metric Statistics Cards
          if (data.stats) {
            const consultCard = document.getElementById('valConsultations');
            if (consultCard && data.stats.upcoming_consultations !== undefined) {
              consultCard.setAttribute('data-target', data.stats.upcoming_consultations);
              consultCard.textContent = data.stats.upcoming_consultations;
            }

            const pkgCard = document.getElementById('valPackages');
            if (pkgCard && data.stats.active_packages !== undefined) {
              pkgCard.setAttribute('data-target', data.stats.active_packages);
              pkgCard.textContent = data.stats.active_packages;
            }

            const msgCard = document.getElementById('valMessages');
            if (msgCard && data.stats.unread_messages !== undefined) {
              msgCard.setAttribute('data-target', data.stats.unread_messages);
              msgCard.textContent = data.stats.unread_messages;
            }

            animateDashboardMetrics();
          }

          // 3. My Package Section
          renderMyPackage(data.my_package);
          if (data.diet_plan || data.my_package?.diet_plan) {
            cachedDietPlan = data.diet_plan || data.my_package?.diet_plan;
            populateDietUI(cachedDietPlan);
          }

          // 4. Latest Health Metric Badges
          if (data.metrics) {
            const weightVal = document.getElementById('weightMetricValue');
            if (weightVal && data.metrics.weight) weightVal.textContent = data.metrics.weight;

            const abdVal = document.getElementById('abdomenMetricValue');
            if (abdVal && data.metrics.abdomen) abdVal.textContent = data.metrics.abdomen;

            const bpVal = document.getElementById('bpMetricValue');
            if (bpVal && data.metrics.bp) bpVal.textContent = data.metrics.bp;

            const sugarVal = document.getElementById('sugarMetricValue');
            if (sugarVal && data.metrics.sugar) sugarVal.textContent = data.metrics.sugar;
          }

          // 5. Render Dynamic Graphs
          if (data.graphs) {
            renderAllCharts();
          }

          // 6. Notifications List
          renderNotifications(data.notifications);
        }
      }
    } catch (e) {
      console.warn('Dashboard dynamic fetch error:', e);
    } finally {
      hidePageLoader();
    }
  };

  fetchDashboardData();

  // Timeframe Dropdown Select Filter Handlers
  document.querySelectorAll('.metric-filter-select').forEach(select => {
    select.addEventListener('change', (e) => {
      const metric = select.getAttribute('data-metric') || 'weight';
      const timeframe = e.target.value;
      activeTimeframes[metric] = timeframe;
      renderChart(metric, timeframe);
      showToast(`Showing ${timeframe.toUpperCase()} trend for ${metric.toUpperCase()}`);
    });
  });

  // Modal Dialog Handlers for Add New Reading
  const openReadingModal = () => {
    if (readingModalOverlay) {
      readingModalOverlay.style.display = 'flex';
      document.body.style.overflow = 'hidden';
      // Default to today's date if empty
      const readingDateInput = document.getElementById('readingDate');
      if (readingDateInput && !readingDateInput.value) {
        readingDateInput.value = new Date().toISOString().split('T')[0];
      }
      document.getElementById('readingWeight')?.focus();
    }
  };

  const closeReadingModal = () => {
    if (readingModalOverlay) {
      readingModalOverlay.style.display = 'none';
      document.body.style.overflow = '';
      if (readingForm) readingForm.reset();
    }
  };

  if (addReadingBtn) {
    addReadingBtn.addEventListener('click', openReadingModal);
  }

  if (closeReadingModalBtn) {
    closeReadingModalBtn.addEventListener('click', closeReadingModal);
  }

  if (cancelReadingBtn) {
    cancelReadingBtn.addEventListener('click', closeReadingModal);
  }

  if (readingModalOverlay) {
    readingModalOverlay.addEventListener('click', (e) => {
      if (e.target === readingModalOverlay) {
        closeReadingModal();
      }
    });
  }

  // Clickable Calendar Icon triggers Date Picker
  const btnOpenDatePicker = document.getElementById('btnOpenDatePicker');
  const readingDateInput = document.getElementById('readingDate');
  if (btnOpenDatePicker && readingDateInput) {
    btnOpenDatePicker.addEventListener('click', (e) => {
      e.preventDefault();
      readingDateInput.type = 'date';
      readingDateInput.focus();
      try {
        if (typeof readingDateInput.showPicker === 'function') {
          readingDateInput.showPicker();
        }
      } catch (err) {}
    });
  }

  // Handle Reading Form Submission & Save to MySQL Database
  if (readingForm) {
    readingForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const dateInput = document.getElementById('readingDate')?.value.trim();
      const weightInput = document.getElementById('readingWeight')?.value.trim();
      const abdomenInput = document.getElementById('readingAbdomen')?.value.trim();
      const bpInput = document.getElementById('readingBP')?.value.trim();
      const sugarInput = document.getElementById('readingSugar')?.value.trim();

      if (!weightInput && !abdomenInput && !bpInput && !sugarInput) {
        showToast('Please enter at least one health parameter.', true);
        return;
      }

      const updateBtn = readingForm.querySelector('button[type="submit"]');
      const origBtnText = updateBtn ? updateBtn.innerHTML : 'Update';
      if (updateBtn) {
        updateBtn.disabled = true;
        updateBtn.textContent = 'Updating...';
      }

      try {
        const payload = {
          action: 'add_reading',
          phone: cachedPhone || '9876543210',
          patient_id: cachedPatientId || 'P001',
          date: dateInput || null,
          weight: weightInput || null,
          abdomen: abdomenInput || null,
          bp: bpInput || null,
          sugar: sugarInput || null
        };

        const res = await fetch('../api/dashboard.php', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          const resData = await res.json();
          if (resData.success) {
            // Update badges from server response
            if (resData.metrics) {
              if (resData.metrics.weight) {
                const el = document.getElementById('weightMetricValue');
                if (el) el.textContent = resData.metrics.weight;
              }
              if (resData.metrics.abdomen) {
                const el = document.getElementById('abdomenMetricValue');
                if (el) el.textContent = resData.metrics.abdomen;
              }
              if (resData.metrics.bp) {
                const el = document.getElementById('bpMetricValue');
                if (el) el.textContent = resData.metrics.bp;
              }
              if (resData.metrics.sugar) {
                const el = document.getElementById('sugarMetricValue');
                if (el) el.textContent = resData.metrics.sugar;
              }
            } else {
              if (resData.weight) {
                const el = document.getElementById('weightMetricValue');
                if (el) el.textContent = resData.weight;
              }
              if (resData.abdomen) {
                const el = document.getElementById('abdomenMetricValue');
                if (el) el.textContent = resData.abdomen;
              }
              if (resData.bp) {
                const el = document.getElementById('bpMetricValue');
                if (el) el.textContent = resData.bp;
              }
              if (resData.sugar) {
                const el = document.getElementById('sugarMetricValue');
                if (el) el.textContent = resData.sugar;
              }
            }

            // Update graphs in memory and re-render charts immediately
            if (resData.graphs) {
              if (!cachedDashboardData) cachedDashboardData = {};
              cachedDashboardData.graphs = resData.graphs;
              renderAllCharts();
            } else {
              // Refresh dashboard data to update charts
              fetchDashboardData();
            }

            showToast('Health reading recorded successfully!');
            closeReadingModal();
          } else {
            showToast(resData.message || 'Failed to record health reading.', true);
          }
        }
      } catch (err) {
        console.warn('Health reading save error:', err);
        showToast('Error recording health reading. Please try again.', true);
      } finally {
        if (updateBtn) {
          updateBtn.disabled = false;
          updateBtn.innerHTML = origBtnText;
        }
      }
    });
  }

  // Dynamic Diet Plan UI Population
  const populateDietUI = (dietData) => {
    if (!dietData) return;
    const p1 = dietData.paragraph_1 || (Array.isArray(dietData.paragraphs) ? dietData.paragraphs[0] : '') || dietData.diet_hydration || '';
    const p2 = dietData.paragraph_2 || (Array.isArray(dietData.paragraphs) ? dietData.paragraphs[1] : '') || dietData.dinacharya || '';

    if (dietPlanPara1) {
      dietPlanPara1.textContent = p1 || 'Personalized dietary recommendations, food preferences, and daily water intake guidelines based on the patient\'s assessment. Restores digestive fire (Agni) and strengthens gastrointestinal lining with bespoke herbal protocols.';
    }
    if (dietPlanPara2) {
      dietPlanPara2.textContent = p2 || 'A customized daily wellness schedule comprising diet, hydration, physical activity, and Ayurvedic practices as per the doctor\'s protocol. Relieves bloating, improves digestion, boosts vitality and enhances nutrient absorption.';
    }
  };

  // Open & Close View Diet Modal
  const openDietModal = async () => {
    if (!dietModalOverlay) return;

    if (cachedDietPlan) {
      populateDietUI(cachedDietPlan);
    }

    dietModalOverlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    try {
      const params = new URLSearchParams();
      params.append('action', 'view_diet');
      if (cachedPhone) params.append('phone', cachedPhone);
      if (cachedPatientId) params.append('patient_id', cachedPatientId);

      const res = await fetch(`../api/dashboard.php?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.diet_plan) {
          cachedDietPlan = data.diet_plan;
          populateDietUI(data.diet_plan);
        }
      }
    } catch (err) {
      console.warn('Notice: Error fetching dynamic diet plan from database:', err);
    }
  };

  const closeDietModal = () => {
    if (dietModalOverlay) {
      dietModalOverlay.style.display = 'none';
      document.body.style.overflow = '';
    }
  };

  // View Diet Action
  if (viewDietBtn) {
    viewDietBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openDietModal();
    });
  }

  if (closeDietModalBtn) {
    closeDietModalBtn.addEventListener('click', closeDietModal);
  }

  if (dietModalOverlay) {
    dietModalOverlay.addEventListener('click', (e) => {
      if (e.target === dietModalOverlay) {
        closeDietModal();
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (dietModalOverlay && dietModalOverlay.style.display === 'flex') {
        closeDietModal();
      }
      if (readingModalOverlay && readingModalOverlay.style.display === 'flex') {
        closeReadingModal();
      }
    }
  });

  // Logout Modal Handlers
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
      try {
        await fetch('../api/logout.php', { method: 'POST' });
      } catch (err) {}
      try {
        localStorage.removeItem('panchved_user');
        localStorage.removeItem('panchved_patient');
        localStorage.removeItem('panchved_prakruti_result');
      } catch (e) {}
      showToast('Logged out successfully.');
      setTimeout(() => {
        window.location.href = '../index.html';
      }, 350);
    });
  }
});
