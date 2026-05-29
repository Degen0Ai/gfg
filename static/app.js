/* =============================================
   NUTRITRACK — App Logic
   ============================================= */

'use strict';

// ==============================
// STATE
// ==============================
const state = {
  currentPage: 'dashboard',
  todayDate: getTodayString(),
  goals: { calories: 2000, protein: 150, carbs: 250, fat: 65 },
  todayMeals: [],
  historyDate: getTodayString(),
  historyMeals: [],

  // Modal
  selectedImageDataURL: null,   // currently selected image (data URL)
  analysisResult: null,         // last Gemini response
  selectedMealType: 'breakfast',
};

// ==============================
// DATE HELPERS
// ==============================
function getTodayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateDisplay(dateStr) {
  const today = getTodayString();
  const yesterday = offsetDate(today, -1);
  if (dateStr === today) return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatDateFull(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function offsetDate(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning, Josh';
  if (h < 17) return 'Good afternoon, Josh';
  return 'Good evening, Josh';
}

// ==============================
// API
// ==============================
async function apiGet(path) {
  const res = await fetch(path);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

async function apiPost(path, data) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

async function apiDelete(path) {
  const res = await fetch(path, { method: 'DELETE' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

// ==============================
// NAVIGATION
// ==============================
function navigate(page) {
  // Hide all pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));

  // Show target page
  document.getElementById(`page-${page}`).classList.add('active');
  document.querySelector(`.nav-tab[data-page="${page}"]`).classList.add('active');

  state.currentPage = page;

  if (page === 'dashboard') {
    loadDashboard();
  } else if (page === 'history') {
    loadHistory(state.historyDate);
  } else if (page === 'goals') {
    loadGoalsPage();
  }

  // Re-render Lucide icons for newly shown elements
  lucide.createIcons();
}

// ==============================
// DASHBOARD
// ==============================
async function loadDashboard() {
  // Set greeting + date
  document.getElementById('greeting').textContent = getGreeting();
  document.getElementById('today-date').textContent = formatDateFull(state.todayDate);

  try {
    const [meals, goals] = await Promise.all([
      apiGet(`/api/meals?date=${state.todayDate}`),
      apiGet('/api/goals'),
    ]);
    state.todayMeals = meals;
    state.goals = goals;
    renderDashboard();
  } catch (err) {
    showToast('Failed to load dashboard: ' + err.message, 'error');
  }
}

function renderDashboard() {
  const meals = state.todayMeals;
  const goals = state.goals;

  const totals = sumMacros(meals);

  // Calorie Ring
  const CIRCUMFERENCE = 2 * Math.PI * 80; // 502.65
  const ratio = Math.min(totals.calories / (goals.calories || 1), 1);
  const offset = CIRCUMFERENCE - ratio * CIRCUMFERENCE;
  const overGoal = totals.calories > goals.calories;

  const ring = document.getElementById('ring-progress');
  ring.style.strokeDashoffset = offset;
  ring.classList.toggle('over-goal', overGoal);

  document.getElementById('ring-consumed').textContent = Math.round(totals.calories);
  const remaining = Math.round(goals.calories - totals.calories);
  const remainingEl = document.getElementById('ring-remaining');
  if (overGoal) {
    remainingEl.textContent = `${Math.abs(remaining)} over`;
    remainingEl.classList.add('over-goal');
  } else {
    remainingEl.textContent = `${remaining} left`;
    remainingEl.classList.remove('over-goal');
  }

  document.getElementById('meta-goal').textContent = Math.round(goals.calories);
  document.getElementById('meta-eaten').textContent = Math.round(totals.calories);
  document.getElementById('meta-remaining').textContent = Math.abs(remaining);

  // Macros
  setMacro('protein', totals.protein, goals.protein);
  setMacro('carbs', totals.carbs, goals.carbs);
  setMacro('fat', totals.fat, goals.fat);

  // Meal list
  renderMealList('meal-list', 'empty-meals', meals, true);

  lucide.createIcons();
}

function setMacro(name, consumed, goal) {
  const pct = Math.min((consumed / (goal || 1)) * 100, 100);
  document.getElementById(`macro-${name}-val`).textContent = `${Math.round(consumed)}g`;
  document.getElementById(`macro-${name}-bar`).style.width = `${pct}%`;
  document.getElementById(`macro-${name}-goal`).textContent = `of ${Math.round(goal)}g`;
}

function sumMacros(meals) {
  return meals.reduce(
    (acc, m) => ({
      calories: acc.calories + (m.calories || 0),
      protein: acc.protein + (m.protein || 0),
      carbs: acc.carbs + (m.carbs || 0),
      fat: acc.fat + (m.fat || 0),
      fiber: acc.fiber + (m.fiber || 0),
      sugar: acc.sugar + (m.sugar || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 }
  );
}

function renderMealList(listId, emptyId, meals, allowDelete) {
  const listEl = document.getElementById(listId);
  const emptyEl = document.getElementById(emptyId);

  // Remove existing meal cards (keep empty-state div)
  Array.from(listEl.children).forEach(child => {
    if (!child.classList.contains('empty-state')) child.remove();
  });

  if (meals.length === 0) {
    emptyEl.classList.remove('hidden');
    return;
  }
  emptyEl.classList.add('hidden');

  meals.forEach(meal => {
    const card = buildMealCard(meal, allowDelete);
    listEl.appendChild(card);
  });
}

function buildMealCard(meal, allowDelete) {
  const card = document.createElement('div');
  card.className = 'meal-card';
  card.dataset.mealId = meal.id;

  // Thumbnail
  const thumbWrap = document.createElement('div');
  thumbWrap.className = 'meal-thumb-wrap';
  if (meal.image_base64) {
    const img = document.createElement('img');
    img.className = 'meal-thumb';
    img.src = meal.image_base64;
    img.alt = meal.name;
    img.loading = 'lazy';
    thumbWrap.appendChild(img);
  } else {
    thumbWrap.innerHTML = `<div class="meal-thumb-placeholder"><i data-lucide="utensils"></i></div>`;
  }

  // Info
  const info = document.createElement('div');
  info.className = 'meal-info';
  info.innerHTML = `
    <div class="meal-name">${escapeHtml(meal.name)}</div>
    <div class="meal-macros">P ${Math.round(meal.protein)}g · C ${Math.round(meal.carbs)}g · F ${Math.round(meal.fat)}g</div>
  `;

  // Right side
  const right = document.createElement('div');
  right.className = 'meal-right';
  const badge = mealTypeBadge(meal.meal_type);
  right.innerHTML = `
    <span class="meal-calories">${Math.round(meal.calories)}<span class="meal-cal-unit"> kcal</span></span>
    ${badge}
  `;

  card.appendChild(thumbWrap);
  card.appendChild(info);
  card.appendChild(right);

  if (allowDelete) {
    const delBtn = document.createElement('button');
    delBtn.className = 'meal-delete-btn';
    delBtn.setAttribute('aria-label', 'Delete meal');
    delBtn.innerHTML = `<i data-lucide="trash-2"></i>`;
    delBtn.onclick = () => deleteMeal(meal.id, card);
    card.appendChild(delBtn);
  }

  return card;
}

function mealTypeBadge(type) {
  const t = (type || 'snack').toLowerCase();
  return `<span class="meal-type-badge badge-${t}">${capitalize(t)}</span>`;
}

async function deleteMeal(id, cardEl) {
  try {
    await apiDelete(`/api/meals/${id}`);
    cardEl.style.opacity = '0';
    cardEl.style.transform = 'translateX(20px)';
    cardEl.style.transition = 'all 200ms ease';
    setTimeout(() => {
      cardEl.remove();
      // Update state
      state.todayMeals = state.todayMeals.filter(m => m.id !== id);
      renderDashboard();
    }, 200);
  } catch (err) {
    showToast('Failed to delete meal: ' + err.message, 'error');
  }
}

// ==============================
// HISTORY
// ==============================
async function loadHistory(dateStr) {
  state.historyDate = dateStr;
  const label = document.getElementById('hist-date-label');
  label.textContent = formatDateDisplay(dateStr);

  // Disable next button if at today
  document.getElementById('hist-next').disabled = dateStr >= getTodayString();

  try {
    const meals = await apiGet(`/api/meals?date=${dateStr}`);
    state.historyMeals = meals;
    renderHistoryPage();
  } catch (err) {
    showToast('Failed to load history: ' + err.message, 'error');
  }
}

function renderHistoryPage() {
  const meals = state.historyMeals;
  const totals = sumMacros(meals);

  document.getElementById('hist-cal').textContent = Math.round(totals.calories);
  document.getElementById('hist-pro').textContent = `${Math.round(totals.protein)}g`;
  document.getElementById('hist-carb').textContent = `${Math.round(totals.carbs)}g`;
  document.getElementById('hist-fat').textContent = `${Math.round(totals.fat)}g`;

  renderMealList('hist-meal-list', 'hist-empty', meals, false);
  lucide.createIcons();
}

function historyNav(direction) {
  const newDate = offsetDate(state.historyDate, direction);
  if (newDate > getTodayString()) return; // Can't go to future
  loadHistory(newDate);
}

// ==============================
// GOALS PAGE
// ==============================
async function loadGoalsPage() {
  try {
    const goals = await apiGet('/api/goals');
    state.goals = goals;
    populateGoalsForm(goals);
    renderGoalsSummary(goals);
  } catch (err) {
    showToast('Failed to load goals: ' + err.message, 'error');
  }
}

function populateGoalsForm(goals) {
  document.getElementById('goal-calories').value = goals.calories;
  document.getElementById('goal-protein').value = goals.protein;
  document.getElementById('goal-carbs').value = goals.carbs;
  document.getElementById('goal-fat').value = goals.fat;
}

function renderGoalsSummary(goals) {
  document.getElementById('gs-calories').textContent = goals.calories;
  document.getElementById('gs-protein').textContent = `${goals.protein}g`;
  document.getElementById('gs-carbs').textContent = `${goals.carbs}g`;
  document.getElementById('gs-fat').textContent = `${goals.fat}g`;
}

async function saveGoals(event) {
  event.preventDefault();
  const btn = document.getElementById('goals-save-btn');
  btn.disabled = true;
  btn.innerHTML = `<i data-lucide="loader-2"></i> Saving…`;
  lucide.createIcons();

  const data = {
    calories: parseFloat(document.getElementById('goal-calories').value),
    protein: parseFloat(document.getElementById('goal-protein').value),
    carbs: parseFloat(document.getElementById('goal-carbs').value),
    fat: parseFloat(document.getElementById('goal-fat').value),
  };

  try {
    const saved = await apiPost('/api/goals', data);
    state.goals = saved;
    renderGoalsSummary(saved);

    const msg = document.getElementById('goals-saved-msg');
    msg.classList.remove('hidden');
    setTimeout(() => msg.classList.add('hidden'), 3000);
    showToast('Goals saved!', 'success');
  } catch (err) {
    showToast('Failed to save goals: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="check"></i> Save Goals`;
    lucide.createIcons();
  }
}

// ==============================
// MODAL
// ==============================
function openModal() {
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  resetModalToStep('upload');

  // Default meal type based on time of day
  const h = new Date().getHours();
  let defaultType = 'snack';
  if (h >= 5 && h < 11) defaultType = 'breakfast';
  else if (h >= 11 && h < 15) defaultType = 'lunch';
  else if (h >= 17 && h < 22) defaultType = 'dinner';
  selectMealType(defaultType);

  lucide.createIcons();
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.body.style.overflow = '';
  state.selectedImageDataURL = null;
  state.analysisResult = null;
}

function handleOverlayClick(event) {
  if (event.target === document.getElementById('modal-overlay')) {
    closeModal();
  }
}

function resetModalToStep(step) {
  document.getElementById('step-upload').classList.toggle('hidden', step !== 'upload');
  document.getElementById('step-preview').classList.toggle('hidden', step !== 'preview');
  document.getElementById('step-results').classList.toggle('hidden', step !== 'results');
  document.getElementById('modal-loading').classList.add('hidden');
}

function resetUpload() {
  state.selectedImageDataURL = null;
  state.analysisResult = null;
  document.getElementById('file-input').value = '';
  document.getElementById('camera-input').value = '';
  resetModalToStep('upload');
}

// --- File selection ---
function triggerFileInput() {
  document.getElementById('file-input').click();
}

function openCamera() {
  document.getElementById('camera-input').click();
}

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showToast('Please select an image file.', 'error');
    return;
  }
  loadImageFile(file);
}

function handleDragOver(event) {
  event.preventDefault();
  document.getElementById('drop-zone').classList.add('drag-over');
}

function handleDragLeave() {
  document.getElementById('drop-zone').classList.remove('drag-over');
}

function handleDrop(event) {
  event.preventDefault();
  document.getElementById('drop-zone').classList.remove('drag-over');
  const file = event.dataTransfer.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showToast('Please drop an image file.', 'error');
    return;
  }
  loadImageFile(file);
}

function loadImageFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    state.selectedImageDataURL = e.target.result;
    document.getElementById('img-preview').src = e.target.result;
    resetModalToStep('preview');
    lucide.createIcons();
  };
  reader.readAsDataURL(file);
}

// --- Analysis ---
async function analyzeFood() {
  if (!state.selectedImageDataURL) {
    showToast('Please select an image first.', 'error');
    return;
  }

  document.getElementById('modal-loading').classList.remove('hidden');
  document.getElementById('btn-analyze').disabled = true;

  try {
    const result = await apiPost('/api/analyze', {
      image_base64: state.selectedImageDataURL,
    });

    state.analysisResult = result;
    showResults(result);
  } catch (err) {
    showToast(err.message || 'Analysis failed. Please try again.', 'error');
    document.getElementById('modal-loading').classList.add('hidden');
  } finally {
    document.getElementById('btn-analyze').disabled = false;
  }
}

function showResults(result) {
  document.getElementById('modal-loading').classList.add('hidden');

  // Populate results
  document.getElementById('results-name').value = result.name || '';
  document.getElementById('results-thumb').src = state.selectedImageDataURL;
  document.getElementById('results-calories').textContent = Math.round(result.calories || 0);

  document.getElementById('res-protein').textContent = `${(result.protein || 0).toFixed(1)}g`;
  document.getElementById('res-carbs').textContent = `${(result.carbs || 0).toFixed(1)}g`;
  document.getElementById('res-fat').textContent = `${(result.fat || 0).toFixed(1)}g`;
  document.getElementById('res-fiber').textContent = `${(result.fiber || 0).toFixed(1)}g`;
  document.getElementById('res-sugar').textContent = `${(result.sugar || 0).toFixed(1)}g`;
  document.getElementById('res-serving').textContent = result.serving_size || '—';

  // Confidence badge
  const conf = (result.confidence || 'medium').toLowerCase();
  const dot = document.getElementById('confidence-dot');
  dot.className = `confidence-dot ${conf}`;
  const confLabels = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' };
  document.getElementById('results-confidence-label').textContent = confLabels[conf] || conf;

  resetModalToStep('results');
  lucide.createIcons();
}

// --- Meal Type Selection ---
function selectMealType(type) {
  state.selectedMealType = type;
  document.querySelectorAll('.meal-type-pill').forEach(pill => {
    pill.classList.toggle('active', pill.dataset.type === type);
  });
}

// --- Save Meal ---
async function saveMeal() {
  const result = state.analysisResult;
  if (!result) {
    showToast('No analysis result to save.', 'error');
    return;
  }

  const name = document.getElementById('results-name').value.trim();
  if (!name) {
    showToast('Please enter a food name.', 'error');
    document.getElementById('results-name').focus();
    return;
  }

  const btn = document.getElementById('btn-save');
  btn.disabled = true;
  btn.innerHTML = `<i data-lucide="loader-2"></i> Saving…`;
  lucide.createIcons();

  try {
    const mealData = {
      date: state.todayDate,
      name,
      calories: result.calories || 0,
      protein: result.protein || 0,
      carbs: result.carbs || 0,
      fat: result.fat || 0,
      fiber: result.fiber || 0,
      sugar: result.sugar || 0,
      image_base64: state.selectedImageDataURL,
      meal_type: state.selectedMealType,
    };

    const saved = await apiPost('/api/meals', mealData);
    state.todayMeals.push(saved);

    closeModal();
    showToast('Meal saved!', 'success');

    // Refresh dashboard if on dashboard
    if (state.currentPage === 'dashboard') {
      renderDashboard();
    }
  } catch (err) {
    showToast('Failed to save meal: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="check-circle"></i> Save to Log`;
    lucide.createIcons();
  }
}

// ==============================
// TOAST
// ==============================
let toastTimer = null;

function showToast(message, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast${type ? ` toast-${type}` : ''}`;
  toast.classList.remove('hidden');

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.add('hidden');
  }, 3500);
}

// ==============================
// UTILS
// ==============================
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ==============================
// INIT
// ==============================
document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide icons
  lucide.createIcons();

  // Load initial page
  loadDashboard();

  // Keyboard: close modal on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('modal-overlay').classList.contains('hidden')) {
      closeModal();
    }
  });
});
