/**
 * Ocayur Patient Portal - Chat Frontend Logic
 * Connects chat.html to ../api/chat.php
 */

document.addEventListener('DOMContentLoaded', () => {
  // State
  let activeDoctorId = 1;
  let allDoctors = [];
  let currentMessages = [];
  let isSending = false;

  // DOM Elements
  const chatDoctorsList = document.getElementById('chatDoctorsList');
  const docCountBadge = document.getElementById('docCountBadge');
  const doctorFilterInput = document.getElementById('doctorFilterInput');

  const activeDocAvatar = document.getElementById('activeDocAvatar');
  const activeDocName = document.getElementById('activeDocName');
  const activeDocRole = document.getElementById('activeDocRole');
  const activeDocExp = document.getElementById('activeDocExp');

  const patientAvatarEl = document.getElementById('patientAvatarEl');
  const patientNameHeader = document.getElementById('patientNameHeader');
  const patientIdHeader = document.getElementById('patientIdHeader');

  const patientChatMessages = document.getElementById('patientChatMessages');
  const patientChatForm = document.getElementById('patientChatForm');
  const patientChatInput = document.getElementById('patientChatInput');
  const btnSendMessage = document.getElementById('btnSendMessage');
  const btnManualRefresh = document.getElementById('btnManualRefresh');
  const refreshTimestampText = document.getElementById('refreshTimestampText');
  
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMsg');

  // Mobile Drawer Toggle
  const mobileMenuToggle = document.getElementById('mobileMenuToggle');
  const dashboardSidebar = document.getElementById('dashboardSidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');

  if (mobileMenuToggle && dashboardSidebar && sidebarOverlay) {
    mobileMenuToggle.addEventListener('click', () => {
      dashboardSidebar.classList.add('open');
      sidebarOverlay.classList.add('active');
    });

    sidebarOverlay.addEventListener('click', () => {
      dashboardSidebar.classList.remove('open');
      sidebarOverlay.classList.remove('active');
    });
  }

  // Toast Helper
  let toastTimer = null;
  function showToast(message) {
    if (!toast) return;
    clearTimeout(toastTimer);
    if (toastMsg) toastMsg.textContent = message;
    toast.className = 'toast show toast-success';
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }

  // Safe HTML helper
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Read doctor_id from URL
  const urlParams = new URLSearchParams(window.location.search);
  const paramDocId = parseInt(urlParams.get('doctor_id') || urlParams.get('id'), 10);
  if (paramDocId && paramDocId > 0) {
    activeDoctorId = paramDocId;
  }

  // Sync logged in Patient info from localStorage if available
  try {
    const patData = JSON.parse((localStorage.getItem('ocayur_patient') || localStorage.getItem('panchved_patient') || localStorage.getItem('ocayur_user')) || '{}');
    if (patData.full_name && patientNameHeader) {
      patientNameHeader.textContent = patData.full_name;
    }
    if (patData.patient_id && patientIdHeader) {
      patientIdHeader.textContent = patData.patient_id;
    }
    if (patientAvatarEl && patData.full_name) {
      const parts = patData.full_name.trim().split(/\s+/);
      let inits = '';
      parts.forEach(p => { if (p) inits += p[0].toUpperCase(); });
      patientAvatarEl.textContent = inits.slice(0, 2) || 'PT';
    }
  } catch (_) {}

  // =========================================================================
  // 1. Fetch Chat Thread & Doctors List
  // =========================================================================
  async function loadChatData(doctorId, isManualRefresh = false) {
    if (isManualRefresh && btnManualRefresh) {
      btnManualRefresh.classList.add('refreshing');
    }

    try {
      const res = await fetch(`../api/chat.php?doctor_id=${doctorId}`);
      const data = await res.json();

      if (data.table_missing) {
        patientChatMessages.innerHTML = `
          <div class="chat-empty-state">
            <div class="chat-empty-icon" style="background: #FDF2F2; color: #D32F2F;">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            </div>
            <h3 style="color: #25231F; margin: 0 0 8px;">Database Table Required</h3>
            <p style="font-size: 0.88rem; color: #5C564D; max-width: 480px; margin: 0 auto 16px;">
              The <code>chat_messages</code> table has not been created yet in the database.
            </p>
            <div style="background: #FAF6EE; padding: 12px 16px; border-radius: 8px; font-family: monospace; font-size: 0.8rem; text-align: left; max-width: 520px; border: 1px solid #ECE5D9;">
              CREATE TABLE IF NOT EXISTS \`chat_messages\` (<br>
              &nbsp;&nbsp;\`id\` INT(11) NOT NULL AUTO_INCREMENT,<br>
              &nbsp;&nbsp;\`doctor_id\` INT(11) NOT NULL,<br>
              &nbsp;&nbsp;\`patient_id\` INT(11) NOT NULL,<br>
              &nbsp;&nbsp;\`sender_type\` ENUM('doctor', 'patient') NOT NULL,<br>
              &nbsp;&nbsp;\`message\` TEXT NOT NULL,<br>
              &nbsp;&nbsp;\`is_seen\` TINYINT(1) NOT NULL DEFAULT 0,<br>
              &nbsp;&nbsp;\`seen_at\` DATETIME DEFAULT NULL,<br>
              &nbsp;&nbsp;\`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,<br>
              &nbsp;&nbsp;PRIMARY KEY (\`id\`)<br>
              );
            </div>
          </div>
        `;
        return;
      }

      if (data.success) {
        // Patient Header Update
        if (data.patient) {
          if (patientNameHeader) patientNameHeader.textContent = data.patient.full_name;
          if (patientIdHeader) patientIdHeader.textContent = data.patient.patient_id;
          if (patientAvatarEl) patientAvatarEl.textContent = data.patient.initials || 'RS';
        }

        // Doctor Header Update
        if (data.doctor) {
          activeDoctorId = data.doctor.id;
          if (activeDocName) activeDocName.textContent = data.doctor.full_name;
          if (activeDocRole) activeDocRole.textContent = data.doctor.expertise || 'Ayurveda Physician';
          if (activeDocExp) activeDocExp.textContent = data.doctor.area ? `${data.doctor.area}` : 'Specialist';
          if (activeDocAvatar) activeDocAvatar.textContent = data.doctor.initials || 'DR';
        }

        // Doctors Sidebar List Update
        if (Array.isArray(data.doctors)) {
          allDoctors = data.doctors;
          if (docCountBadge) docCountBadge.textContent = `${allDoctors.length} Available`;
          renderDoctorsList(allDoctors);
        }

        // Messages Stream
        currentMessages = data.messages || [];
        renderMessagesStream(currentMessages);

        // Update timestamp
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        if (refreshTimestampText) {
          refreshTimestampText.textContent = `Last refreshed at ${timeStr}`;
        }

        if (isManualRefresh) {
          showToast('Messages & read receipts updated.');
        }
      } else {
        patientChatMessages.innerHTML = `
          <div class="chat-empty-state">
            <p style="color: #D32F2F;">${escapeHtml(data.message || 'Failed to load chat.')}</p>
          </div>
        `;
      }
    } catch (err) {
      console.error('Error loading chat:', err);
    } finally {
      if (btnManualRefresh) {
        setTimeout(() => {
          btnManualRefresh.classList.remove('refreshing');
        }, 400);
      }
    }
  }

  // =========================================================================
  // 2. Render Doctors in Left Sidebar
  // =========================================================================
  function renderDoctorsList(doctors) {
    if (!chatDoctorsList) return;

    if (doctors.length === 0) {
      chatDoctorsList.innerHTML = `
        <li style="padding: 24px; text-align: center; color: #8E877B; font-size: 0.85rem;">
          No doctors found.
        </li>
      `;
      return;
    }

    chatDoctorsList.innerHTML = doctors.map(d => {
      const isActive = (d.id === activeDoctorId) ? 'active' : '';
      const unreadBadge = (d.unread_count > 0)
        ? `<span class="patient-unread-badge" style="background: #723F1E; color: #fff; font-size: 0.72rem; font-weight: 700; padding: 1px 6px; border-radius: 10px;">${d.unread_count}</span>`
        : '';
      const displaySnippet = d.last_message || 'Start consultation';

      return `
        <li class="doctor-conv-item ${isActive}" data-id="${d.id}">
          <div class="doctor-conv-avatar">${escapeHtml(d.initials || 'DR')}</div>
          <div class="doctor-conv-info">
            <div class="doctor-conv-top">
              <span class="doctor-conv-name">${escapeHtml(d.full_name)}</span>
              <span class="doctor-conv-time">${escapeHtml(d.last_message_time || '')}</span>
            </div>
            <p class="doctor-conv-role">${escapeHtml(d.expertise || 'Doctor')}</p>
            <div class="doctor-conv-bottom">
              <p class="doctor-conv-snippet">${escapeHtml(displaySnippet)}</p>
              ${unreadBadge}
            </div>
          </div>
        </li>
      `;
    }).join('');

    chatDoctorsList.querySelectorAll('.doctor-conv-item').forEach(item => {
      item.addEventListener('click', () => {
        const dId = parseInt(item.getAttribute('data-id'), 10);
        if (dId && dId !== activeDoctorId) {
          activeDoctorId = dId;

          const newUrl = new URL(window.location.href);
          newUrl.searchParams.set('doctor_id', activeDoctorId);
          window.history.pushState({}, '', newUrl);

          chatDoctorsList.querySelectorAll('.doctor-conv-item').forEach(el => el.classList.remove('active'));
          item.classList.add('active');

          loadChatData(activeDoctorId);
        }
      });
    });
  }

  // Filter Doctors by search
  if (doctorFilterInput) {
    doctorFilterInput.addEventListener('input', () => {
      const q = doctorFilterInput.value.toLowerCase().trim();
      if (!q) {
        renderDoctorsList(allDoctors);
        return;
      }
      const filtered = allDoctors.filter(d =>
        (d.full_name && d.full_name.toLowerCase().includes(q)) ||
        (d.expertise && d.expertise.toLowerCase().includes(q)) ||
        (d.area && d.area.toLowerCase().includes(q))
      );
      renderDoctorsList(filtered);
    });
  }

  // =========================================================================
  // 3. Render Messages with Read Receipts
  // =========================================================================
  function renderMessagesStream(messages) {
    if (!patientChatMessages) return;

    if (!messages || messages.length === 0) {
      patientChatMessages.innerHTML = `
        <div class="chat-empty-state">
          <div class="chat-empty-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
          <h3 style="font-size: 1.05rem; color: #25231F; margin: 0 0 4px;">No messages with this doctor yet</h3>
          <p style="font-size: 0.85rem; color: #5C564D; margin: 0;">Type your medical query or symptoms below to send to doctor.</p>
        </div>
      `;
      return;
    }

    let html = '';
    let lastDate = '';

    messages.forEach(msg => {
      // Date divider
      if (msg.date !== lastDate) {
        html += `
          <div class="chat-date-divider">
            <span class="chat-date-pill">${escapeHtml(msg.date)}</span>
          </div>
        `;
        lastDate = msg.date;
      }

      const isPatient = (msg.sender_type === 'patient');
      const rowClass = isPatient ? 'patient-msg' : 'doctor-msg';

      // Read Receipt indicator for Patient's sent messages
      let readReceiptHtml = '';
      if (isPatient) {
        if (msg.is_seen === 1) {
          const seenTime = msg.seen_at_display ? `at ${msg.seen_at_display}` : '';
          readReceiptHtml = `
            <span class="read-receipt-badge seen" title="Seen by doctor ${seenTime}">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
                <polyline points="15 6 9 12"></polyline>
              </svg>
              <span>Seen ${seenTime}</span>
            </span>
          `;
        } else {
          readReceiptHtml = `
            <span class="read-receipt-badge unseen" title="Sent. Doctor has not refreshed yet.">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              <span>Unseen</span>
            </span>
          `;
        }
      }

      html += `
        <div class="chat-message-row ${rowClass}" id="pat-msg-${msg.id}">
          <div class="chat-bubble">
            ${escapeHtml(msg.message).replace(/\n/g, '<br>')}
          </div>
          <div class="chat-msg-meta">
            <span class="chat-msg-time">${escapeHtml(msg.time)}</span>
            ${readReceiptHtml}
          </div>
        </div>
      `;
    });

    patientChatMessages.innerHTML = html;
    scrollToBottom();
  }

  function scrollToBottom() {
    if (patientChatMessages) {
      patientChatMessages.scrollTop = patientChatMessages.scrollHeight;
    }
  }

  // =========================================================================
  // 4. Send Message (Patient -> Doctor)
  // =========================================================================
  async function sendMessage() {
    if (isSending || !patientChatInput) return;
    const text = patientChatInput.value.trim();
    if (!text) return;

    isSending = true;
    if (btnSendMessage) btnSendMessage.disabled = true;

    try {
      const response = await fetch('../api/chat.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          doctor_id: activeDoctorId,
          message: text
        })
      });

      const result = await response.json();
      if (result.success && result.message_item) {
        patientChatInput.value = '';
        patientChatInput.style.height = 'auto';

        currentMessages.push(result.message_item);
        renderMessagesStream(currentMessages);

        showToast('Message sent. Marked as Unseen until doctor refreshes.');
      } else {
        showToast(result.message || 'Failed to send message.');
      }
    } catch (err) {
      console.error('Error sending message:', err);
      showToast('Error connecting to chat server.');
    } finally {
      isSending = false;
      if (btnSendMessage) btnSendMessage.disabled = false;
      patientChatInput.focus();
    }
  }

  if (patientChatForm) {
    patientChatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      sendMessage();
    });
  }

  if (patientChatInput) {
    patientChatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    patientChatInput.addEventListener('input', () => {
      patientChatInput.style.height = 'auto';
      patientChatInput.style.height = Math.min(patientChatInput.scrollHeight, 120) + 'px';
    });
  }

  // =========================================================================
  // 5. Manual Refresh Button Listener
  // =========================================================================
  if (btnManualRefresh) {
    btnManualRefresh.addEventListener('click', () => {
      loadChatData(activeDoctorId, true);
    });
  }

  // Initialize
  loadChatData(activeDoctorId);
});
