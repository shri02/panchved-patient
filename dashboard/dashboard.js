/**
 * Ocayur Patient Portal - Dashboard Engine
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
  const quickDietPdfLink = document.getElementById('quickDietPdfLink');
  const dietPdfCard = document.getElementById('dietPdfCard');
  const dietPdfTitle = document.getElementById('dietPdfTitle');
  const dietPdfMeta = document.getElementById('dietPdfMeta');
  const dietPdfViewBtn = document.getElementById('dietPdfViewBtn');
  const dietPdfDownloadBtn = document.getElementById('dietPdfDownloadBtn');
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
  // Render Dynamic Bar Chart for a specific metric and timeframe
  // Render chart using dynamic API data only; if no data is added, show clean empty state instead of graph.
  const renderChart = (metricKey, timeframe = '6w') => {
    const container = document.getElementById(`${metricKey}BarsArea`);
    if (!container) return;

    const metricGraph = cachedDashboardData?.graphs?.[metricKey];
    const dataset = (metricGraph && Array.isArray(metricGraph.timeframes?.[timeframe]))
      ? metricGraph.timeframes[timeframe]
      : [];

    // Check if any readings exist across all timeframes for this metric
    const allTimeframes = metricGraph?.timeframes || {};
    const totalReadings = Object.values(allTimeframes).reduce(
      (sum, list) => sum + (Array.isArray(list) ? list.length : 0),
      0
    );

    container.replaceChildren();

    // If no dynamic data is added/present for this metric or timeframe
    if (!metricGraph || dataset.length === 0) {
      container.classList.add('has-no-data');

      const emptyWrapper = document.createElement('div');
      emptyWrapper.className = 'chart-empty-state';

      const emptyMsg = totalReadings === 0
        ? 'No health data recorded yet'
        : 'No readings recorded for this timeframe';

      emptyWrapper.innerHTML = `
        <div class="chart-empty-icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="20" x2="18" y2="10"></line>
            <line x1="12" y1="20" x2="12" y2="4"></line>
            <line x1="6" y1="20" x2="6" y2="14"></line>
          </svg>
        </div>
        <p class="chart-empty-title">${emptyMsg}</p>
        <span class="chart-empty-hint">Use "Add New Reading" to record data</span>
      `;
      container.appendChild(emptyWrapper);
      return;
    }

    // Dynamic data is present: render the bar chart
    container.classList.remove('has-no-data');

    dataset.forEach(item => {
      const column = document.createElement('div');
      column.className = 'chart-col';
      column.title = `${item.date_label || ''}: ${item.val_label || ''} ${metricGraph.unit || ''}`;

      const valueLabel = document.createElement('span');
      valueLabel.className = 'bar-val-label';
      valueLabel.textContent = item.val_label ?? '';

      const track = document.createElement('div');
      track.className = 'bar-track';

      const fill = document.createElement('div');
      fill.className = `bar-fill ${metricGraph.color_class || 'bar-teal'}`;

      const height = Number(item.height_percent);
      fill.style.height = `${Number.isFinite(height) ? Math.max(0, Math.min(100, height)) : 0}%`;

      track.appendChild(fill);

      const dateLabel = document.createElement('span');
      dateLabel.className = 'bar-date-label';
      dateLabel.textContent = item.date_label ?? '';

      column.append(valueLabel, track, dateLabel);
      container.appendChild(column);
    });
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
      if (nameEl) nameEl.textContent = 'No Active Programme';
      if (startEl) startEl.textContent = 'Explore our tailored wellness programmes';
      if (fillEl) fillEl.style.width = '0%';
      if (percentEl) percentEl.textContent = '0 %';
      if (weekEl) weekEl.textContent = 'Enroll today';
      return;
    }

    if (nameEl) nameEl.textContent = pkgData.package_name || '--';
    if (startEl) startEl.textContent = pkgData.start_date ? `Started on ${pkgData.start_date}` : 'Ongoing Health Program';
    const percent = Number(pkgData.progress_percent ?? 0);
    if (fillEl) fillEl.style.width = `${percent}%`;
    if (percentEl) percentEl.textContent = pkgData.progress_text || `${percent} %`;
    if (weekEl) weekEl.textContent = pkgData.week_info || '--';
  };

  // Step 1: Populate from cached session immediately
  let cachedPhone = '';
  let cachedPatientId = '';
  try {
    let storedUser = JSON.parse((localStorage.getItem('ocayur_patient_user') || localStorage.getItem('panchved_patient_user') || localStorage.getItem('ocayur_user') || localStorage.getItem('panchved_user')) || 'null');
    if (storedUser && storedUser.role && String(storedUser.role).toLowerCase() !== 'patient') {
      storedUser = null;
    }
    const storedPatient = JSON.parse((localStorage.getItem('ocayur_patient') || localStorage.getItem('panchved_patient')) || 'null');
    if (storedUser || storedPatient) {
      applyDashboardPatient(storedUser, storedPatient);
      cachedPhone = storedPatient?.phone_number || storedUser?.phone_number || '';
      cachedPatientId = storedPatient?.patient_id || '';
    } else {
      window.location.replace('../index.html');
      return;
    }
  } catch (err) {
    console.warn('Unable to load stored dashboard session', err);
  }

  // Step 2: Dynamically fetch fresh data from database via PHP (api/dashboard.php)
  // Step 2: Dynamically fetch fresh data from database via split APIs
  const fetchDashboardData = async () => {
    const params = new URLSearchParams();
    if (cachedPhone) params.append('phone', cachedPhone);
    if (cachedPatientId) params.append('patient_id', cachedPatientId);
    const queryString = params.toString() ? `?${params.toString()}` : '';

    // 1. Fetch Stats & Package Details
    const fetchStats = async () => {
      try {
        const res = await fetch(`../api/dashboard_stats.php${queryString}`, { headers: { 'Accept': 'application/json' } });
        console.log(`[API: Stats] HTTP ${res.status}`);
        if (!res.ok) {
          console.warn(`[API: Stats] Status ${res.status}:`, await res.text().catch(() => ''));
          return;
        }
        const data = await res.json();
        console.log('[API: Stats] Payload:', data);
        if (data.success) {
          if (data.patient) {
            applyDashboardPatient(null, data.patient);
            try { localStorage.setItem('ocayur_patient', JSON.stringify(data.patient)); } catch (e) {}
          }
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
          if (data.my_package) {
            renderMyPackage(data.my_package);
          }
        }
      } catch (err) {
        console.error('[API: Stats] Error:', err);
      }
    };

    // 2. Fetch Health Metrics & Charts
    const fetchMetrics = async () => {
      try {
        const res = await fetch(`../api/dashboard_metrics.php${queryString}`, { headers: { 'Accept': 'application/json' } });
        console.log(`[API: Metrics] HTTP ${res.status}`);
        if (!res.ok) {
          console.warn(`[API: Metrics] Status ${res.status}:`, await res.text().catch(() => ''));
          return;
        }
        const data = await res.json();
        console.log('[API: Metrics] Payload:', data);
        if (data.success) {
          cachedDashboardData = { ...(cachedDashboardData || {}), ...data };
          if (data.has_recorded_today !== undefined) {
            updateAddReadingButtonState(Boolean(data.has_recorded_today));
          }

          const metricFields = {
            weight: 'weightMetricValue',
            abdomen: 'abdomenMetricValue',
            bp: 'bpMetricValue',
            sugar: 'sugarMetricValue'
          };

          Object.entries(metricFields).forEach(([key, elementId]) => {
            const el = document.getElementById(elementId);
            if (!el) return;
            const val = data.metrics?.[key];
            el.textContent = (val !== null && val !== undefined && val !== '') ? val : '--';
          });

          if (data.graphs) {
            renderAllCharts();
          }
        }
      } catch (err) {
        console.error('[API: Metrics] Error:', err);
      }
    };

    // 3. Fetch Diet Plan
    const fetchDiet = async () => {
      try {
        const res = await fetch(`../api/dashboard_diet.php${queryString}`, { headers: { 'Accept': 'application/json' } });
        console.log(`[API: Diet] HTTP ${res.status}`);
        if (!res.ok) {
          console.warn(`[API: Diet] Status ${res.status}:`, await res.text().catch(() => ''));
          return;
        }
        const data = await res.json();
        console.log('[API: Diet] Payload:', data);
        if (data.success && data.diet_plan) {
          cachedDietPlan = data.diet_plan;
          populateDietUI(cachedDietPlan);
        }
      } catch (err) {
        console.error('[API: Diet] Error:', err);
      }
    };

    // 4. Fetch Notifications
    const fetchNotifications = async () => {
      try {
        const res = await fetch(`../api/dashboard_notifications.php${queryString}`, { headers: { 'Accept': 'application/json' } });
        console.log(`[API: Notifications] HTTP ${res.status}`);
        if (!res.ok) {
          console.warn(`[API: Notifications] Status ${res.status}:`, await res.text().catch(() => ''));
          return;
        }
        const data = await res.json();
        console.log('[API: Notifications] Payload:', data);
        if (data.success && data.notifications) {
          renderNotifications(data.notifications);
        }
      } catch (err) {
        console.error('[API: Notifications] Error:', err);
      }
    };

    try {
      await Promise.allSettled([
        fetchStats(),
        fetchMetrics(),
        fetchDiet(),
        fetchNotifications()
      ]);
    } catch (e) {
      console.warn('Dashboard fetch general error:', e);
    } finally {
      hidePageLoader();
    }
  };

  renderAllCharts();
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

  // Dynamic Daily Metric Availability & Button State Handler
  const updateAddReadingButtonState = (hasRecordedToday) => {
    if (!addReadingBtn) return;
    if (hasRecordedToday) {
      addReadingBtn.classList.add('already-added');
      addReadingBtn.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span>Reading Added Today</span>
      `;
      addReadingBtn.title = 'You have already recorded your health metrics for today. Only one reading per day is allowed.';
    } else {
      addReadingBtn.classList.remove('already-added');
      addReadingBtn.innerHTML = '<span>Add New Reading</span>';
      addReadingBtn.title = 'Add your daily health reading';
    }
  };

  const readingModalNotice = document.getElementById('readingModalNotice');
  const readingModalNoticeText = document.getElementById('readingModalNoticeText');
  const btnUpdateReading = document.getElementById('btnUpdateReading');

  const checkDateAvailability = (selectedDate) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const targetDate = selectedDate || todayStr;
    const isToday = (targetDate === todayStr);

    const alreadyRecordedToday = Boolean(cachedDashboardData?.has_recorded_today);
    const dateAlreadyRecorded = Boolean(cachedDashboardData?.recorded_dates && cachedDashboardData.recorded_dates.includes(targetDate));

    if ((isToday && alreadyRecordedToday) || dateAlreadyRecorded) {
      if (readingModalNotice && readingModalNoticeText) {
        readingModalNoticeText.textContent = isToday
          ? 'You have already recorded your health metrics for today. Only one reading per day is allowed.'
          : `Health metrics have already been recorded for this date (${targetDate}). Only one reading per day is allowed.`;
        readingModalNotice.style.display = 'flex';
      }
      if (btnUpdateReading) {
        btnUpdateReading.disabled = true;
        btnUpdateReading.title = 'Reading already recorded for this day.';
      }
      return false;
    } else {
      if (readingModalNotice) {
        readingModalNotice.style.display = 'none';
      }
      if (btnUpdateReading) {
        btnUpdateReading.disabled = false;
        btnUpdateReading.removeAttribute('title');
      }
      return true;
    }
  };

  // Modal Dialog Handlers for Add New Reading
  const openReadingModal = () => {
    if (cachedDashboardData?.has_recorded_today) {
      showToast('You have already recorded your health metrics for today. Only one reading per day is allowed.', true);
      return;
    }

    if (readingModalOverlay) {
      readingModalOverlay.style.display = 'flex';
      document.body.style.overflow = 'hidden';
      // Default to today's date if empty and restrict future dates
      const readingDateInput = document.getElementById('readingDate');
      const todayStr = new Date().toISOString().split('T')[0];
      if (readingDateInput) {
        readingDateInput.max = todayStr;
        if (!readingDateInput.value) {
          readingDateInput.value = todayStr;
        }
        checkDateAvailability(readingDateInput.value);
      }
      document.getElementById('readingWeight')?.focus();
    }
  };

  const closeReadingModal = () => {
    if (readingModalOverlay) {
      readingModalOverlay.style.display = 'none';
      document.body.style.overflow = '';
      if (readingModalNotice) {
        readingModalNotice.style.display = 'none';
      }
      if (btnUpdateReading) {
        btnUpdateReading.disabled = false;
        btnUpdateReading.removeAttribute('title');
      }
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

  // Clickable Calendar Icon triggers Date Picker & Validate On Change
  const btnOpenDatePicker = document.getElementById('btnOpenDatePicker');
  const readingDateInput = document.getElementById('readingDate');
  if (readingDateInput) {
    const handleDateValidation = () => {
      checkDateAvailability(readingDateInput.value.trim());
    };
    readingDateInput.addEventListener('change', handleDateValidation);
    readingDateInput.addEventListener('input', handleDateValidation);
  }
  if (btnOpenDatePicker && readingDateInput) {
    btnOpenDatePicker.addEventListener('click', (e) => {
      e.preventDefault();
      readingDateInput.type = 'date';
      const todayStr = new Date().toISOString().split('T')[0];
      readingDateInput.max = todayStr;
      readingDateInput.focus();
      try {
        if (typeof readingDateInput.showPicker === 'function') {
          readingDateInput.showPicker();
        }
      } catch (err) {}
    });
  }

  // Restrict Health Reading Inputs: Disallow letters and non-numeric characters
  const restrictDecimalInput = (inputEl) => {
    if (!inputEl) return;

    // Disallow letter keys and non-numeric characters on keydown
    inputEl.addEventListener('keydown', (e) => {
      const allowedKeys = ['Backspace', 'Tab', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'Escape', 'Home', 'End'];
      if (allowedKeys.includes(e.key) || e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }
      // Block letters completely
      if (/[a-zA-Z]/.test(e.key)) {
        e.preventDefault();
        return;
      }
      // Allow single decimal point only
      if (e.key === '.') {
        if (inputEl.value.includes('.')) {
          e.preventDefault();
        }
        return;
      }
      // Disallow anything other than digits (0-9)
      if (!/^[0-9]$/.test(e.key)) {
        e.preventDefault();
      }
    });

    // Clean any letters or invalid characters on input (paste, autofill, virtual keyboard)
    inputEl.addEventListener('input', () => {
      let val = inputEl.value;
      val = val.replace(/[a-zA-Z]/g, '').replace(/[^0-9.]/g, '');
      const parts = val.split('.');
      if (parts.length > 2) {
        val = parts[0] + '.' + parts.slice(1).join('');
      }
      if (inputEl.value !== val) {
        inputEl.value = val;
      }
    });

    // Sanitize on paste
    inputEl.addEventListener('paste', (e) => {
      const pasteText = (e.clipboardData || window.clipboardData)?.getData('text') || '';
      if (/[a-zA-Z]/.test(pasteText) || /[^0-9.]/.test(pasteText)) {
        e.preventDefault();
        let cleaned = pasteText.replace(/[a-zA-Z]/g, '').replace(/[^0-9.]/g, '');
        const start = inputEl.selectionStart || 0;
        const end = inputEl.selectionEnd || 0;
        let nextVal = inputEl.value.slice(0, start) + cleaned + inputEl.value.slice(end);
        const parts = nextVal.split('.');
        if (parts.length > 2) {
          nextVal = parts[0] + '.' + parts.slice(1).join('');
        }
        inputEl.value = nextVal;
        inputEl.dispatchEvent(new Event('input'));
      }
    });
  };

  const restrictBpInput = (inputEl) => {
    if (!inputEl) return;

    // Disallow letter keys and non-numeric/slash characters on keydown
    inputEl.addEventListener('keydown', (e) => {
      const allowedKeys = ['Backspace', 'Tab', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'Escape', 'Home', 'End'];
      if (allowedKeys.includes(e.key) || e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }
      // Block letters completely
      if (/[a-zA-Z]/.test(e.key)) {
        e.preventDefault();
        return;
      }
      // Allow single slash only
      if (e.key === '/') {
        if (inputEl.value.includes('/')) {
          e.preventDefault();
        }
        return;
      }
      // Disallow anything other than digits (0-9)
      if (!/^[0-9]$/.test(e.key)) {
        e.preventDefault();
      }
    });

    // Clean any letters or invalid characters on input
    inputEl.addEventListener('input', () => {
      let val = inputEl.value;
      val = val.replace(/[a-zA-Z]/g, '').replace(/[^0-9/]/g, '');
      const parts = val.split('/');
      if (parts.length > 2) {
        val = parts[0] + '/' + parts.slice(1).join('');
      }
      if (inputEl.value !== val) {
        inputEl.value = val;
      }
    });

    // Sanitize on paste
    inputEl.addEventListener('paste', (e) => {
      const pasteText = (e.clipboardData || window.clipboardData)?.getData('text') || '';
      if (/[a-zA-Z]/.test(pasteText) || /[^0-9/]/.test(pasteText)) {
        e.preventDefault();
        let cleaned = pasteText.replace(/[a-zA-Z]/g, '').replace(/[^0-9/]/g, '');
        const start = inputEl.selectionStart || 0;
        const end = inputEl.selectionEnd || 0;
        let nextVal = inputEl.value.slice(0, start) + cleaned + inputEl.value.slice(end);
        const parts = nextVal.split('/');
        if (parts.length > 2) {
          nextVal = parts[0] + '/' + parts.slice(1).join('');
        }
        inputEl.value = nextVal;
        inputEl.dispatchEvent(new Event('input'));
      }
    });
  };

  // Attach restriction handlers to health reading inputs
  restrictDecimalInput(document.getElementById('readingWeight'));
  restrictDecimalInput(document.getElementById('readingAbdomen'));
  restrictDecimalInput(document.getElementById('readingSugar'));
  restrictBpInput(document.getElementById('readingBP'));

  // Handle Reading Form Submission & Save to MySQL Database
  if (readingForm) {
    readingForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const dateInput = document.getElementById('readingDate')?.value.trim();
      const weightInput = document.getElementById('readingWeight')?.value.trim();
      const abdomenInput = document.getElementById('readingAbdomen')?.value.trim();
      const bpInput = document.getElementById('readingBP')?.value.trim();
      const sugarInput = document.getElementById('readingSugar')?.value.trim();

      const todayStr = new Date().toISOString().split('T')[0];
      const targetDate = dateInput || todayStr;

      // Restrict future date input
      if (targetDate > todayStr) {
        showToast('Cannot record health metrics for future dates.', true);
        return;
      }

      // Check once-per-day restriction before submitting
      const alreadyRecordedToday = Boolean(cachedDashboardData?.has_recorded_today);
      const isToday = (targetDate === todayStr);
      const dateAlreadyRecorded = Boolean(cachedDashboardData?.recorded_dates && cachedDashboardData.recorded_dates.includes(targetDate));

      if ((isToday && alreadyRecordedToday) || dateAlreadyRecorded) {
        showToast(isToday ? 'You have already recorded your health metrics for today. Only one reading per day is allowed.' : `Health metrics have already been recorded for this date. Only one reading per day is allowed.`, true);
        checkDateAvailability(targetDate);
        return;
      }

      // Ensure no letters are present in any health parameter
      const hasLetters = (val) => typeof val === 'string' && /[a-zA-Z]/.test(val);
      if (hasLetters(weightInput) || hasLetters(abdomenInput) || hasLetters(bpInput) || hasLetters(sugarInput)) {
        showToast('Letters are not allowed in health readings. Please enter numbers only.', true);
        return;
      }

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
          phone: cachedPhone || undefined,
          patient_id: cachedPatientId || undefined,
          date: dateInput || new Date().toISOString().split('T')[0],
          weight: weightInput || null,
          abdomen: abdomenInput || null,
          bp: bpInput || null,
          sugar: sugarInput || null
        };

        const res = await fetch('../api/dashboard_metrics.php', {
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

            if (cachedDashboardData) {
              cachedDashboardData.has_recorded_today = true;
              if (Array.isArray(resData.recorded_dates)) {
                cachedDashboardData.recorded_dates = resData.recorded_dates;
              } else if (cachedDashboardData.recorded_dates && !cachedDashboardData.recorded_dates.includes(targetDate)) {
                cachedDashboardData.recorded_dates.push(targetDate);
              }
            }
            updateAddReadingButtonState(true);

            showToast('Health reading recorded successfully!');

            // Redirect to the dashboard after saving.
            setTimeout(() => {
              window.location.href = 'dashboard.html';
            }, 500);
          } else {
            if (resData.already_recorded) {
              if (cachedDashboardData) {
                cachedDashboardData.has_recorded_today = true;
                if (resData.recorded_date && cachedDashboardData.recorded_dates && !cachedDashboardData.recorded_dates.includes(resData.recorded_date)) {
                  cachedDashboardData.recorded_dates.push(resData.recorded_date);
                }
              }
              updateAddReadingButtonState(true);
              closeReadingModal();
            }
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

    // PDF attachment handling
    const hasPdf = Boolean(dietData.has_pdf && (dietData.pdf_url || dietData.direct_url));
    const pdfUrl = dietData.pdf_url || dietData.direct_url || '';
    const downloadUrl = dietData.download_url || dietData.direct_url || pdfUrl;
    const pdfName = dietData.pdf_name || 'Diet_Chart.pdf';
    const fileSize = dietData.file_size ? ` • ${dietData.file_size}` : '';
    const updated = dietData.updated_at ? ` • Updated ${dietData.updated_at}` : '';

    if (quickDietPdfLink) {
      if (hasPdf) {
        quickDietPdfLink.href = pdfUrl;
        quickDietPdfLink.target = '_blank';
        quickDietPdfLink.rel = 'noopener noreferrer';
        quickDietPdfLink.style.display = 'inline-flex';
      } else {
        quickDietPdfLink.style.display = 'none';
      }
    }

    if (dietPdfCard) {
      if (hasPdf) {
        dietPdfCard.style.display = 'flex';
        if (dietPdfTitle) dietPdfTitle.textContent = pdfName;
        if (dietPdfMeta) dietPdfMeta.textContent = `PDF Document${fileSize}${updated}`;
        if (dietPdfViewBtn) {
          dietPdfViewBtn.href = pdfUrl;
          dietPdfViewBtn.target = '_blank';
          dietPdfViewBtn.rel = 'noopener noreferrer';
        }
        if (dietPdfDownloadBtn) {
          dietPdfDownloadBtn.href = downloadUrl;
          dietPdfDownloadBtn.setAttribute('download', pdfName);
        }
      } else {
        dietPdfCard.style.display = 'none';
      }
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

      const res = await fetch(`../api/dashboard_diet.php?${params.toString()}`);
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
        localStorage.removeItem('ocayur_user'); localStorage.removeItem('panchved_user');
        localStorage.removeItem('ocayur_patient'); localStorage.removeItem('panchved_patient');
        localStorage.removeItem('ocayur_prakruti_result'); localStorage.removeItem('panchved_prakruti_result');
      } catch (e) {}
      showToast('Logged out successfully.');
      setTimeout(() => {
        window.location.href = '../index.html';
      }, 350);
    });
  }

  // ========================================================
  // Direct Book Consultation Modal & Dynamic Doctor Engine
  // ========================================================
  const btnBookConsultCTA = document.getElementById('btnBookConsultCTA');
  const cardBookConsultBtn = document.getElementById('cardBookConsultBtn');
  const consultationModal = document.getElementById('consultationModal');
  const closeConsultationModalBtn = document.getElementById('closeConsultationModalBtn');
  const consultationBookingForm = document.getElementById('consultationBookingForm');
  const submitConsultationBtn = document.getElementById('submitConsultationBtn');
  const consultName = document.getElementById('consultName');
  const consultMobile = document.getElementById('consultMobile');
  const consultEmail = document.getElementById('consultEmail');
  const consultDate = document.getElementById('consultDate');
  const btnDateCalendar = document.getElementById('btnDateCalendar');
  const nativeDatePicker = document.getElementById('nativeDatePicker');
  const consultStartTime = document.getElementById('consultStartTime');
  const btnStartTimeClock = document.getElementById('btnStartTimeClock');
  const startTimeDropdown = document.getElementById('startTimeDropdown');
  const consultDoctor = document.getElementById('consultDoctor');
  const consultAgenda = document.getElementById('consultAgenda');

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

  const isDoctorAvailableAt = (doc, timeStr) => {
    if (!timeStr) return true;
    const timeMins = parseTimeToMinutes(timeStr);
    if (timeMins === null) return true;
    const docId = parseInt(doc.id, 10);
    const schedule = doc.schedule || doctorSchedules[docId] || [
      { start: 540, end: 1140, text: '09:00 AM - 07:00 PM' }
    ];
    return schedule.some(slot => {
      const s = slot.start_min !== undefined ? slot.start_min : slot.start;
      const e = slot.end_min !== undefined ? slot.end_min : slot.end;
      return timeMins >= s && timeMins < e;
    });
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

  const updateDoctorsForStartTime = (selectedTime) => {
    if (!consultDoctor) return;
    const time = selectedTime !== undefined ? selectedTime : (consultStartTime?.value.trim() || '');
    const currentSelected = consultDoctor.value;

    if (!time) {
      renderDoctorSelectOptions(activeDoctorsList, currentSelected, 'Select Doctor');
      return;
    }

    const availableDocs = activeDoctorsList.filter(doc => isDoctorAvailableAt(doc, time));
    if (availableDocs.length === 0) {
      consultDoctor.innerHTML = `<option value="" disabled selected>No doctors available at ${escapeHtml(time)}</option>`;
      consultDoctor.selectedIndex = 0;
    } else {
      renderDoctorSelectOptions(availableDocs, currentSelected, `Select Doctor (${availableDocs.length} available)`);
    }
  };

  const fetchDoctorsFromDB = async () => {
    try {
      const res = await fetch('../api/doctors.php');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.doctors) && data.doctors.length > 0) {
          activeDoctorsList = data.doctors;
          updateDoctorsForStartTime(consultStartTime?.value.trim() || '');
          return;
        }
      }
    } catch (e) {
      console.warn('Notice: Backend fetch doctors error:', e);
    }
    activeDoctorsList = [
      { id: 1, name: 'Dr. Nidhi Jha', role: 'Ayurveda Physician (Pediatrics & Gynecology)', initials: 'NJ' },
      { id: 2, name: 'Dr. Rohit Mehra', role: 'Physiotherapist (Pune)', initials: 'RM' },
      { id: 3, name: 'Dr. Priya Patel', role: 'Panchakarma Specialist', initials: 'PP' },
      { id: 4, name: 'Dr. Ankit Verma', role: 'Ayurvedic Consultant (Chronic Disease Management)', initials: 'AV' },
      { id: 5, name: 'Dr. Sneha Kulkarni', role: 'Neuro-Physiotherapist (Neurological Rehab)', initials: 'SK' }
    ];
    updateDoctorsForStartTime(consultStartTime?.value.trim() || '');
  };

  fetchDoctorsFromDB();

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

  const clockHoursList = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
  const clockMinutesList = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];
  const clockPeriodsList = ['AM', 'PM'];

  const renderCompleteClockPicker = (dropdownEl, inputEl) => {
    if (!dropdownEl || !inputEl) return;
    let { hour, minute, period } = parseTimeComponents(inputEl.value, '07', '00', 'PM');
    if (!clockMinutesList.includes(minute)) {
      const minNum = parseInt(minute, 10);
      const rounded = Math.round(minNum / 5) * 5 % 60;
      minute = String(rounded).padStart(2, '0');
    }

    dropdownEl.innerHTML = `
      <div class="clock-picker-header">
        <span class="clock-header-title">Start Time</span>
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
        <div class="clock-hint-wrap">Standard session: 45 min</div>
        <button type="button" class="clock-btn-apply">Set Time</button>
      </div>
    `;

    setTimeout(() => {
      const activeHour = dropdownEl.querySelector('.clock-hours-scroll .clock-unit-btn.active');
      const activeMin = dropdownEl.querySelector('.clock-mins-scroll .clock-unit-btn.active');
      if (activeHour) activeHour.scrollIntoView({ block: 'nearest' });
      if (activeMin) activeMin.scrollIntoView({ block: 'nearest' });
    }, 10);
  };

  const setupTimePicker = (inputEl, btnEl, dropdownEl) => {
    if (!inputEl || !btnEl || !dropdownEl) return;

    const toggleDropdown = (show) => {
      const willShow = show !== undefined ? show : !dropdownEl.classList.contains('active');
      if (willShow) {
        document.querySelectorAll('.time-picker-dropdown.active').forEach(d => {
          if (d !== dropdownEl) d.classList.remove('active');
        });
        renderCompleteClockPicker(dropdownEl, inputEl);
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

    dropdownEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const unitBtn = e.target.closest('.clock-unit-btn');
      if (unitBtn) {
        const unit = unitBtn.getAttribute('data-unit');
        const val = unitBtn.getAttribute('data-val');
        const colScroll = unitBtn.closest('.clock-col-scroll');
        if (colScroll) {
          colScroll.querySelectorAll('.clock-unit-btn').forEach(b => b.classList.remove('active'));
          unitBtn.classList.add('active');
        }

        if (unit === 'hour') {
          const hDisp = dropdownEl.querySelector('.clock-hour-disp');
          if (hDisp) hDisp.textContent = val;
        } else if (unit === 'minute') {
          const mDisp = dropdownEl.querySelector('.clock-min-disp');
          if (mDisp) mDisp.textContent = val;
        } else if (unit === 'period') {
          const pDisp = dropdownEl.querySelector('.clock-period-disp');
          if (pDisp) pDisp.textContent = val;
        }
        return;
      }

      const applyBtn = e.target.closest('.clock-btn-apply');
      if (applyBtn) {
        const h = dropdownEl.querySelector('.clock-hour-disp')?.textContent || '07';
        const m = dropdownEl.querySelector('.clock-min-disp')?.textContent || '00';
        const p = dropdownEl.querySelector('.clock-period-disp')?.textContent || 'PM';
        const formatted = `${h}:${m} ${p}`;
        inputEl.value = formatted;
        dropdownEl.classList.remove('active');
        updateDoctorsForStartTime(formatted);
      }
    });
  };

  setupTimePicker(consultStartTime, btnStartTimeClock, startTimeDropdown);

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.time-picker-container')) {
      document.querySelectorAll('.time-picker-dropdown.active').forEach(d => d.classList.remove('active'));
    }
  });

  const getLoggedInUserData = () => {
    let name = '';
    let phone = '';

    const storages = [localStorage, sessionStorage];
    for (const storage of storages) {
      if (!storage) continue;

      if (!name || !phone) {
        try {
          const pat = JSON.parse(storage.getItem('ocayur_patient') || storage.getItem('panchved_patient') || 'null');
          if (pat && typeof pat === 'object') {
            if (!name) name = pat.full_name || pat.fullName || pat.name || '';
            if (!phone) phone = pat.phone_number || pat.phoneNumber || pat.phone || pat.mobile || '';
          }
        } catch (e) {}
      }

      if (!name || !phone) {
        try {
          const usr = JSON.parse(storage.getItem('ocayur_user') || storage.getItem('panchved_user') || storage.getItem('ocayur_patient_user') || 'null');
          if (usr && typeof usr === 'object') {
            if (!name) name = usr.full_name || usr.fullName || usr.name || usr.username || '';
            if (!phone) phone = usr.phone_number || usr.phoneNumber || usr.phone || usr.mobile || '';
          }
        } catch (e) {}
      }
    }

    if (!phone && cachedPhone) phone = cachedPhone;
    if (!name) {
      const headerName = document.getElementById('userName')?.textContent?.trim();
      if (headerName) name = headerName;
    }

    let cleanPhone = String(phone || '').replace(/\D/g, '');
    if (cleanPhone.length === 12 && cleanPhone.startsWith('91')) {
      cleanPhone = cleanPhone.slice(2);
    } else if (cleanPhone.length > 10) {
      cleanPhone = cleanPhone.slice(-10);
    }

    return { name: name.trim(), phone: cleanPhone };
  };

  const openBookingModal = () => {
    if (!consultationModal) return;

    if (consultationBookingForm) consultationBookingForm.reset();

    const userData = getLoggedInUserData();
    if (consultName) {
      consultName.value = userData.name;
      consultName.readOnly = false;
      consultName.disabled = false;
    }
    if (consultMobile) {
      consultMobile.value = userData.phone;
      consultMobile.readOnly = false;
      consultMobile.disabled = false;
    }

    if (consultEmail) consultEmail.value = '';
    if (consultDate) consultDate.value = '';
    if (consultStartTime) consultStartTime.value = '';
    if (consultAgenda) consultAgenda.value = '';
    if (nativeDatePicker) nativeDatePicker.value = '';

    updateDoctorsForStartTime('');
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

  if (cardBookConsultBtn) {
    cardBookConsultBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openBookingModal();
    });
  }

  if (closeConsultationModalBtn) {
    closeConsultationModalBtn.addEventListener('click', () => closeBookingModal());
  }

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
        const availDocs = activeDoctorsList.filter(d => isDoctorAvailableAt(d, startTime));
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
        console.warn('localStorage error', err);
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
        window.location.href = '../consultation/consultation-checkout.html';
      }, 500);
    });
  }

  // Backdrop click & ESC key handler for consultation modal
  if (consultationModal) {
    consultationModal.addEventListener('click', (e) => {
      if (e.target === consultationModal) closeBookingModal();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && consultationModal && consultationModal.classList.contains('active')) {
      closeBookingModal();
    }
  });
});
