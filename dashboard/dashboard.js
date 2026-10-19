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
      if (nameEl) nameEl.textContent = 'No Active Package';
      if (startEl) startEl.textContent = 'Explore our tailored wellness packages';
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
            try { localStorage.setItem('ocayur_patient', JSON.stringify(data.patient)); } catch (e) {}
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

         // 4. Latest Health Metric Badges — API data only
const metricFields = {
  weight: 'weightMetricValue',
  abdomen: 'abdomenMetricValue',
  bp: 'bpMetricValue',
  sugar: 'sugarMetricValue'
};

Object.entries(metricFields).forEach(([key, elementId]) => {
  const element = document.getElementById(elementId);
  if (!element) return;

  const value = data.metrics?.[key];

  element.textContent =
    value !== null && value !== undefined && value !== ''
      ? value
      : '--';
});

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

// Redirect to the dashboard after saving.
setTimeout(() => {
  window.location.href = 'dashboard.html';
}, 500);
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
});
