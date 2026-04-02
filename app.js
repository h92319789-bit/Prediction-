/**
 * Predictions - Client-Side JavaScript
 * Handles all interactive features: menus, forms, betting, modals, etc.
 */

document.addEventListener('DOMContentLoaded', () => {

  // ============================================
  // Mobile Menu Toggle
  // ============================================
  const mobileBtn = document.querySelector('.mobile-menu-btn');
  const navLinks = document.querySelector('.nav-links');
  if (mobileBtn) {
    mobileBtn.addEventListener('click', () => {
      navLinks.classList.toggle('active');
    });
  }

  // ============================================
  // User Dropdown Menu
  // ============================================
  const userBtn = document.querySelector('.nav-user-btn');
  const dropdown = document.querySelector('.nav-dropdown');
  if (userBtn && dropdown) {
    userBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('active');
    });
    document.addEventListener('click', () => {
      dropdown.classList.remove('active');
    });
    // Prevent dropdown from closing when clicking inside it
    dropdown.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  // ============================================
  // Character Counter for Textareas
  // ============================================
  document.querySelectorAll('textarea[maxlength]').forEach(textarea => {
    const max = textarea.getAttribute('maxlength');
    const counter = document.createElement('div');
    counter.className = 'char-counter';
    counter.textContent = `${textarea.value.length} / ${max}`;
    textarea.parentNode.appendChild(counter);
    textarea.addEventListener('input', () => {
      counter.textContent = `${textarea.value.length} / ${max}`;
      if (textarea.value.length > max * 0.9) {
        counter.classList.add('warning');
      } else {
        counter.classList.remove('warning');
      }
    });
  });

  // ============================================
  // Probability Slider
  // ============================================
  const probSlider = document.getElementById('probability');
  const probValue = document.getElementById('probability-value');
  const probBar = document.getElementById('probability-bar-fill');
  if (probSlider) {
    const updateProb = () => {
      const val = probSlider.value;
      if (probValue) probValue.textContent = val + '%';
      if (probBar) {
        probBar.style.width = val + '%';
        // Color gradient: green (low) -> yellow (50) -> red (high)
        const hue = (1 - val / 100) * 120;
        probBar.style.backgroundColor = `hsl(${hue}, 70%, 50%)`;
      }
    };
    probSlider.addEventListener('input', updateProb);
    updateProb();
  }

  // ============================================
  // Stake Validation
  // ============================================
  const stakeInput = document.getElementById('stake');
  const maxCredits = document.getElementById('max-credits');
  if (stakeInput && maxCredits) {
    stakeInput.addEventListener('input', () => {
      const max = parseInt(maxCredits.value);
      if (parseInt(stakeInput.value) > max) {
        stakeInput.value = max;
      }
      if (parseInt(stakeInput.value) < 0) {
        stakeInput.value = 0;
      }
    });
  }

  // ============================================
  // Bet Position Toggle
  // ============================================
  const positionBtns = document.querySelectorAll('.position-btn');
  const positionInput = document.getElementById('position');
  positionBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      positionBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (positionInput) positionInput.value = btn.dataset.position;
    });
  });

  // ============================================
  // Bet Amount and Payout Estimate
  // ============================================
  const betAmount = document.getElementById('bet-amount');
  const payoutEstimate = document.getElementById('payout-estimate');
  const yesPool = document.getElementById('yes-pool');
  const noPool = document.getElementById('no-pool');
  const totalPool = document.getElementById('total-pool');

  if (betAmount && payoutEstimate) {
    betAmount.addEventListener('input', updatePayout);
    if (positionBtns.length) {
      positionBtns.forEach(btn => btn.addEventListener('click', updatePayout));
    }

    function updatePayout() {
      const amount = parseInt(betAmount.value) || 0;
      const position = positionInput ? positionInput.value : 'yes';
      const yp = parseInt(yesPool?.dataset.value || '0');
      const np = parseInt(noPool?.dataset.value || '0');
      const tp = parseInt(totalPool?.dataset.value || '0');

      const myPool = position === 'yes' ? yp + amount : np + amount;
      const newTotal = tp + amount;

      if (myPool > 0 && amount > 0) {
        const payout = Math.floor((amount / myPool) * newTotal);
        payoutEstimate.textContent = payout + ' credits';
        payoutEstimate.className = 'payout-value ' + (payout > amount ? 'text-success' : 'text-danger');
      } else {
        payoutEstimate.textContent = '0 credits';
        payoutEstimate.className = 'payout-value';
      }
    }
  }

  // ============================================
  // Dismiss Alerts
  // ============================================
  document.querySelectorAll('.alert-dismiss').forEach(btn => {
    btn.addEventListener('click', () => {
      const alert = btn.closest('.alert');
      alert.style.opacity = '0';
      alert.style.transform = 'translateY(-10px)';
      setTimeout(() => alert.remove(), 300);
    });
  });

  // ============================================
  // Confirm Dangerous Actions
  // ============================================
  document.querySelectorAll('[data-confirm]').forEach(el => {
    el.addEventListener('click', (e) => {
      if (!confirm(el.dataset.confirm)) {
        e.preventDefault();
      }
    });
  });

  // ============================================
  // Modal System
  // ============================================
  document.querySelectorAll('[data-modal]').forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      const modal = document.getElementById(trigger.dataset.modal);
      if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
      }
    });
  });

  function closeModal(modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }

  document.querySelectorAll('.modal-close').forEach(el => {
    el.addEventListener('click', () => {
      closeModal(el.closest('.modal'));
    });
  });

  document.querySelectorAll('.modal-overlay').forEach(el => {
    el.addEventListener('click', () => {
      closeModal(el.closest('.modal'));
    });
  });

  // Close modal on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const activeModal = document.querySelector('.modal.active');
      if (activeModal) closeModal(activeModal);
    }
  });

  // ============================================
  // Auto-hide Flash Messages after 5s
  // ============================================
  document.querySelectorAll('.alert').forEach(alert => {
    setTimeout(() => {
      alert.style.opacity = '0';
      alert.style.transform = 'translateY(-10px)';
      setTimeout(() => alert.remove(), 300);
    }, 5000);
  });

  // ============================================
  // Time Ago Helper
  // ============================================
  function timeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 0) return 'in the future';
    const intervals = [
      { label: 'y', seconds: 31536000 },
      { label: 'mo', seconds: 2592000 },
      { label: 'w', seconds: 604800 },
      { label: 'd', seconds: 86400 },
      { label: 'h', seconds: 3600 },
      { label: 'm', seconds: 60 },
    ];
    for (const interval of intervals) {
      const count = Math.floor(seconds / interval.seconds);
      if (count >= 1) return count + interval.label + ' ago';
    }
    return 'just now';
  }

  // Update all elements with data-timestamp
  document.querySelectorAll('[data-timestamp]').forEach(el => {
    const timestamp = new Date(el.dataset.timestamp);
    el.textContent = timeAgo(timestamp);
  });

  // Refresh time-ago labels every minute
  setInterval(() => {
    document.querySelectorAll('[data-timestamp]').forEach(el => {
      const timestamp = new Date(el.dataset.timestamp);
      el.textContent = timeAgo(timestamp);
    });
  }, 60000);

  // ============================================
  // Admin: Role Change Shows Ban Reason
  // ============================================
  const roleSelect = document.getElementById('admin-role');
  const banReasonGroup = document.getElementById('ban-reason-group');
  if (roleSelect && banReasonGroup) {
    roleSelect.addEventListener('change', () => {
      banReasonGroup.style.display =
        (roleSelect.value === 'banned' || roleSelect.value === 'shadowbanned') ? 'block' : 'none';
    });
    // Initialize on load
    banReasonGroup.style.display =
      (roleSelect.value === 'banned' || roleSelect.value === 'shadowbanned') ? 'block' : 'none';
  }

  // ============================================
  // Tabs
  // ============================================
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const group = btn.closest('.tabs');
      group.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const target = btn.dataset.tab;
      group.parentNode.querySelectorAll('.tab-content').forEach(tc => {
        tc.classList.toggle('active', tc.id === target);
      });
    });
  });

  // ============================================
  // Search Form Auto-submit on Filter Change
  // ============================================
  const filterForm = document.getElementById('filter-form');
  if (filterForm) {
    filterForm.querySelectorAll('select').forEach(select => {
      select.addEventListener('change', () => filterForm.submit());
    });
  }

  // ============================================
  // Notification Polling (every 60s)
  // ============================================
  const notifBadge = document.querySelector('.notification-badge');
  if (document.querySelector('.nav-user-btn')) {
    setInterval(async () => {
      try {
        const res = await fetch('/api/notifications/count');
        if (!res.ok) return;
        const data = await res.json();
        if (notifBadge) {
          notifBadge.textContent = data.count;
          notifBadge.style.display = data.count > 0 ? 'flex' : 'none';
        }
      } catch (e) {
        // Silently fail - notification polling is non-critical
      }
    }, 60000);
  }

  // ============================================
  // Close mobile nav on link click
  // ============================================
  if (navLinks) {
    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('active');
      });
    });
  }

  // ============================================
  // Close mobile nav on outside click
  // ============================================
  document.addEventListener('click', (e) => {
    if (navLinks && navLinks.classList.contains('active')) {
      if (!navLinks.contains(e.target) && !mobileBtn.contains(e.target)) {
        navLinks.classList.remove('active');
      }
    }
  });

});
