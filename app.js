const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

let balance = 0;
let depositedThisMonth = 0;
const weeklySavings = {};
let toastTimer;

function money(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function currentWeekDays() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return { date, key: localDateKey(date), label: new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date) };
  });
}

function renderWeeklyChart() {
  const days = currentWeekDays();
  const values = days.map((day) => weeklySavings[day.key] || 0);
  const total = values.reduce((sum, value) => sum + value, 0);
  const max = Math.max(...values, 0);
  const bestIndex = max > 0 ? values.indexOf(max) : -1;
  $('#weeklyTotal').textContent = money(total);
  $('#weeklyBestDay').textContent = bestIndex >= 0 ? days[bestIndex].label : '—';
  $('#weeklyBestAmount').textContent = bestIndex >= 0 ? `${money(max)} saved` : 'Add a deposit to start the chart';
  $('#weeklyChart').setAttribute('aria-label', bestIndex >= 0 ? `Saved ${money(total)} this week. Most saved on ${days[bestIndex].label}.` : 'No savings recorded this week yet.');
  $('#weeklyChart').innerHTML = days.map((day, index) => {
    const value = values[index];
    const height = value > 0 ? Math.max(8, (value / max) * 100) : 3;
    return `<div class="weekly-column ${index === bestIndex ? 'best' : ''}"><span class="weekly-value">${value > 0 ? money(value) : ''}</span><div class="weekly-bar-track"><span class="weekly-bar-fill" style="height:${height}%"></span></div><span class="weekly-label">${day.label}</span></div>`;
  }).join('');
}

function recordWeeklySaving(amount, date = new Date()) {
  if (!Number.isFinite(amount) || amount <= 0) return;
  const key = localDateKey(date);
  weeklySavings[key] = (weeklySavings[key] || 0) + amount;
  renderWeeklyChart();
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function safeImageUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function displayDate(value) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T00:00:00`));
}

function showToast(message) {
  const toast = $('#toast');
  $('#toastMessage').textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

function updateBalance(amount) {
  balance += amount;
  if (amount > 0) depositedThisMonth += amount;
  $('#availableBalance').textContent = money(balance);
  const saved = $('.stat-primary strong');
  if (saved) saved.textContent = money(balance);
  const added = $('.stats-grid .stat-card:nth-child(2) strong');
  if (added) added.textContent = money(depositedThisMonth);
}

function addActivity({ title, amount, icon = '↗', kind = 'icon-sage' }) {
  const emptyActivity = $('.empty-activity', $('#activityList'));
  if (emptyActivity) emptyActivity.remove();
  const row = document.createElement('div');
  row.className = 'activity-row';
  row.innerHTML = `<span class="activity-icon ${kind}">${icon}</span><div><strong>${escapeHtml(title)}</strong><small>Just now</small></div><b class="${amount >= 0 ? 'amount-positive' : ''}">${amount >= 0 ? '+' : '−'}${money(Math.abs(amount))}</b>`;
  $('#activityList').prepend(row);
}

function deposit(amount) {
  if (!Number.isFinite(amount) || amount <= 0) return;
  updateBalance(amount);
  recordWeeklySaving(amount);
  addActivity({ title: 'Pocket deposit', amount });
  $('#depositAmount').value = '';
  showToast(`${money(amount)} added to your stash ✦`);
}

function addExpense(name, amount, date) {
  updateBalance(-amount);
  addActivity({ title: name, amount: -amount, icon: '↘', kind: 'icon-coral' });
  const emptyExpense = $('.empty-activity', $('#expenseList'));
  if (emptyExpense) emptyExpense.remove();
  const row = document.createElement('div');
  row.className = 'expense-row';
  row.innerHTML = `<span class="expense-icon" aria-hidden="true">↘</span><div class="expense-info"><strong>${escapeHtml(name)}</strong><small>Purchase</small></div><span class="expense-date">${displayDate(date)}</span><span class="expense-amount">−${money(amount)}</span>`;
  $('#expenseList').prepend(row);
  const count = $('#expenseList').querySelectorAll('.expense-row').length;
  $('#spendingCount').textContent = count;
  $('#spendingHeadingCount').textContent = count;
  showToast(`${money(amount)} logged for ${name}`);
}

function daysUntil(dateValue) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${dateValue}T00:00:00`);
  return Math.round((due - today) / 86400000);
}

function planTiming(dateValue) {
  const days = daysUntil(dateValue);
  if (days < 0) return { label: 'past due', className: 'soon' };
  if (days === 0) return { label: 'today', className: 'soon' };
  if (days === 1) return { label: 'tomorrow', className: 'soon' };
  return { label: `in ${days} days`, className: days <= 7 ? 'soon' : 'later' };
}

function debtTiming(dateValue) {
  const days = daysUntil(dateValue);
  if (days < 0) return { label: `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} late`, className: 'overdue' };
  if (days === 0) return { label: 'due today', className: 'today' };
  if (days === 1) return { label: 'due tomorrow', className: 'today' };
  return { label: `due in ${days} days`, className: '' };
}

function currentMonthTotals() {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const plans = $$('#planList .plan-row').filter((row) => row.dataset.planDate.startsWith(monthKey) && row.dataset.paid !== 'true');
  const debts = $$('#debtList .debt-row').filter((row) => row.dataset.debtDate.startsWith(monthKey) && row.dataset.paid !== 'true');
  return { count: plans.length + debts.length, total: [...plans, ...debts].reduce((sum, row) => sum + Number(row.dataset.planAmount || row.dataset.debtAmount), 0) };
}

function updatePlanSummary() {
  const rows = $$('#planList .plan-row');
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const activeThisMonth = rows.filter((row) => row.dataset.planDate.startsWith(monthKey) && row.dataset.paid !== 'true');
  const total = activeThisMonth.reduce((sum, row) => sum + Number(row.dataset.planAmount), 0);
  $('#plansHeadingCount').textContent = rows.length;
  $('#plansNavCount').textContent = rows.length;
  $('#planSummary').textContent = `${activeThisMonth.length} plan${activeThisMonth.length === 1 ? '' : 's'} due this month · ${money(total)}`;
  const monthTotals = currentMonthTotals();
  $('#upcomingAmount').textContent = money(monthTotals.total);
  $('#upcomingCaption').textContent = monthTotals.count ? `${monthTotals.count} this month` : 'No plans or debts this month';
}

function updateDebtSummary() {
  const rows = $$('#debtList .debt-row');
  const openRows = rows.filter((row) => row.dataset.paid !== 'true');
  const total = openRows.reduce((sum, row) => sum + Number(row.dataset.debtAmount), 0);
  $('#debtsHeadingCount').textContent = openRows.length;
  $('#debtsNavCount').textContent = openRows.length;
  $('#debtTotal').textContent = money(total);
  $('#debtCaption').textContent = openRows.length ? `${openRows.length} open item${openRows.length === 1 ? '' : 's'}` : 'No open debts';
  updateOverdueAlert();
}

function updateOverdueAlert() {
  const openRows = $$('#debtList .debt-row').filter((row) => row.dataset.paid !== 'true');
  const overdue = openRows.filter((row) => daysUntil(row.dataset.debtDate) < 0);
  const alert = $('#overdueAlert');
  const shouldShow = openRows.length > 0 && overdue.length > 0;
  alert.hidden = false;
  alert.classList.toggle('is-overdue', shouldShow);
  alert.classList.toggle('idle', !shouldShow);
  alert.setAttribute('aria-hidden', 'false');
  if (!overdue.length) {
    $('#overdueHeadline').textContent = 'Gojo is keeping watch.';
    $('#overdueCopy').textContent = 'No overdue debts — you’re all caught up.';
    return;
  }
  const firstName = overdue[0].querySelector('.debt-name strong').textContent;
  $('#overdueHeadline').textContent = overdue.length === 1 ? `${firstName} is overdue!` : `${overdue.length} debts are overdue!`;
  $('#overdueCopy').textContent = overdue.length === 1 ? `Your ${firstName} debt is overdue — make sure to pay up.` : 'These debt items are overdue — make sure to pay up.';
}

function openPlanModal() {
  $('#planModal').hidden = false;
  document.body.style.overflow = 'hidden';
  setTimeout(() => $('#planName').focus(), 50);
}

function closePlanModal() {
  $('#planModal').hidden = true;
  document.body.style.overflow = '';
}

function openDebtModal() {
  $('#debtModal').hidden = false;
  document.body.style.overflow = 'hidden';
  setTimeout(() => $('#debtName').focus(), 50);
}

function closeDebtModal() {
  $('#debtModal').hidden = true;
  document.body.style.overflow = '';
}

let activeGoalCard = null;

function updateGoalCard(card) {
  const saved = Number(card.dataset.saved);
  const target = Number(card.dataset.target);
  const percent = Math.min(100, Math.round((saved / target) * 100));
  card.querySelector('.goal-percent').textContent = `${percent}%`;
  card.querySelector('.goal-saved').innerHTML = `${money(saved)} saved <span>of ${money(target)}</span>`;
  card.querySelector('.progress-track span').style.width = `${percent}%`;
  const action = card.querySelector('.deposit-goal');
  if (percent >= 100) {
    card.classList.add('goal-complete');
    action.textContent = 'Goal reached ✓';
    action.disabled = true;
  }
  updateJar();
}

function updateJar() {
  const cards = $$('#goalList .goal-card');
  const targetTotal = cards.reduce((sum, card) => sum + Number(card.dataset.target), 0);
  const savedTotal = cards.reduce((sum, card) => sum + Number(card.dataset.saved), 0);
  const percent = targetTotal ? Math.min(100, Math.round((savedTotal / targetTotal) * 100)) : 0;
  $('#jarFill').style.height = `${percent}%`;
  $('#jarPercent').textContent = `${percent}%`;
  $$('.jar-coin').forEach((coin, index) => coin.classList.toggle('visible', percent >= ((index + 1) / 12) * 100));
}

function openGoalDepositModal(card) {
  activeGoalCard = card;
  const saved = Number(card.dataset.saved);
  const target = Number(card.dataset.target);
  $('#goalDepositTitle').textContent = `Add to ${card.dataset.goal}`;
  $('#goalDepositCopy').textContent = `${money(saved)} saved of ${money(target)} — every little bit counts.`;
  $('#goalDepositAmount').value = '';
  $('#goalDepositModal').hidden = false;
  document.body.style.overflow = 'hidden';
  setTimeout(() => $('#goalDepositAmount').focus(), 50);
}

function closeGoalDepositModal() {
  $('#goalDepositModal').hidden = true;
  activeGoalCard = null;
  document.body.style.overflow = '';
}

$('#depositForm').addEventListener('submit', (event) => {
  event.preventDefault();
  deposit(Number($('#depositAmount').value));
});

const planDateInput = $('#planDate');
planDateInput.value = new Date().toISOString().slice(0, 10);
$('#planForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const name = $('#planName').value.trim();
  const amount = Number($('#planAmount').value);
  const date = planDateInput.value;
  if (!name || !Number.isFinite(amount) || amount <= 0 || !date) return;
  const timing = planTiming(date);
  const row = document.createElement('article');
  row.className = 'plan-row';
  row.dataset.planDate = date;
  row.dataset.planAmount = amount;
  row.innerHTML = `<div class="plan-brand plan-purple">◷</div><div class="plan-name"><strong>${escapeHtml(name)}</strong><span>Monthly · Renews ${displayDate(date)}</span></div><strong class="plan-cost">${money(amount)}</strong><span class="plan-status ${timing.className}">${timing.label}</span><button class="icon-button mark-paid" aria-label="Mark ${escapeHtml(name)} paid">○</button>`;
  const emptyPlans = $('.empty-activity', $('#planList'));
  if (emptyPlans) emptyPlans.remove();
  $('#planList').append(row);
  [...$('#planList').querySelectorAll('.plan-row')].sort((a, b) => a.dataset.planDate.localeCompare(b.dataset.planDate)).forEach((item) => $('#planList').append(item));
  $('#planForm').reset();
  planDateInput.value = date;
  closePlanModal();
  updatePlanSummary();
  showToast(`${name} will show up before it renews`);
});

const debtDateInput = $('#debtDate');
debtDateInput.value = new Date().toISOString().slice(0, 10);
$('#debtForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const name = $('#debtName').value.trim();
  const amount = Number($('#debtAmount').value);
  const date = debtDateInput.value;
  if (!name || !Number.isFinite(amount) || amount <= 0 || !date) return;
  const timing = debtTiming(date);
  const row = document.createElement('article');
  row.className = 'debt-row';
  row.dataset.debtDate = date;
  row.dataset.debtAmount = amount;
  row.innerHTML = `<span class="debt-icon" aria-hidden="true">!</span><div class="debt-name"><strong>${escapeHtml(name)}</strong><small>Due ${displayDate(date)}</small></div><span class="debt-date">${displayDate(date)}</span><span class="debt-amount">${money(amount)}</span><span class="debt-status ${timing.className}">${timing.label}</span><button class="icon-button mark-debt-paid" aria-label="Mark ${escapeHtml(name)} paid">○</button>`;
  const emptyDebts = $('.empty-activity', $('#debtList'));
  if (emptyDebts) emptyDebts.remove();
  $('#debtList').append(row);
  [...$('#debtList').querySelectorAll('.debt-row')].sort((a, b) => a.dataset.debtDate.localeCompare(b.dataset.debtDate)).forEach((item) => $('#debtList').append(item));
  $('#debtForm').reset();
  debtDateInput.value = date;
  closeDebtModal();
  updateDebtSummary();
  updatePlanSummary();
  showToast(`${name} is on your owed list`);
});

const expenseDateInput = $('#expenseDate');
expenseDateInput.value = new Date().toISOString().slice(0, 10);
$('#expenseForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const name = $('#expenseName').value.trim();
  const amount = Number($('#expenseAmount').value);
  const date = expenseDateInput.value;
  if (!name || !Number.isFinite(amount) || amount <= 0 || !date) return;
  addExpense(name, amount, date);
  $('#expenseForm').reset();
  expenseDateInput.value = date;
  $('#expenseName').focus();
});

$$('.quick-amounts button').forEach((button) => {
  button.addEventListener('click', () => deposit(Number(button.dataset.amount)));
});

$('#clearActivity').addEventListener('click', () => {
  $('#activityList').innerHTML = '<p class="empty-activity">Your activity is cleared for now.</p>';
  showToast('Activity tidied up');
});

function openModal() {
  $('#goalModal').hidden = false;
  document.body.style.overflow = 'hidden';
  setTimeout(() => $('#goalName').focus(), 50);
}

function closeModal() {
  $('#goalModal').hidden = true;
  document.body.style.overflow = '';
}

$('#addGoalButton').addEventListener('click', openModal);
$('#quickAddButton').addEventListener('click', openModal);
$('.goal-modal-close').addEventListener('click', closeModal);
$('.plan-modal-close').addEventListener('click', closePlanModal);
$('#goalModal').addEventListener('click', (event) => {
  if (event.target === $('#goalModal')) closeModal();
});
$('#planModal').addEventListener('click', (event) => {
  if (event.target === $('#planModal')) closePlanModal();
});
$('.debt-modal-close').addEventListener('click', closeDebtModal);
$('#debtModal').addEventListener('click', (event) => {
  if (event.target === $('#debtModal')) closeDebtModal();
});
$('.goal-deposit-modal-close').addEventListener('click', closeGoalDepositModal);
$('#goalDepositModal').addEventListener('click', (event) => {
  if (event.target === $('#goalDepositModal')) closeGoalDepositModal();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !$('#goalModal').hidden) closeModal();
  if (event.key === 'Escape' && !$('#planModal').hidden) closePlanModal();
  if (event.key === 'Escape' && !$('#debtModal').hidden) closeDebtModal();
  if (event.key === 'Escape' && !$('#goalDepositModal').hidden) closeGoalDepositModal();
});

$('#goalForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const name = $('#goalName').value.trim();
  const target = Number($('#goalTarget').value);
  const imageUrl = safeImageUrl($('#goalImageUrl').value.trim());
  if (!name || !Number.isFinite(target) || target <= 0) return;
  const card = document.createElement('article');
  card.className = 'goal-card goal-lilac';
  card.dataset.goal = name;
  card.dataset.saved = '0';
  card.dataset.target = target;
  const imageTag = imageUrl ? `<img class="goal-image" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(name)}" />` : `<img class="goal-image" alt="" hidden />`;
  card.innerHTML = `<div class="goal-image-wrap">${imageTag}<span class="goal-image-fallback" ${imageUrl ? 'hidden' : ''} aria-hidden="true">▧</span></div><div class="goal-info"><div class="goal-title-row"><h3>${escapeHtml(name)}</h3><span class="goal-percent">0%</span></div><p class="goal-saved">$0.00 saved <span>of ${money(target)}</span></p><div class="progress-track"><span style="width:0%"></span></div><div class="goal-foot"><span>Target · Someday</span><span class="goal-actions"><button class="small-link deposit-goal">＋ Add money</button><button class="small-link edit-goal">Edit <span aria-hidden="true">↗</span></button></span></div></div>`;
  const image = card.querySelector('.goal-image');
  if (imageUrl) image.addEventListener('error', () => { image.hidden = true; card.querySelector('.goal-image-fallback').hidden = false; });
  const emptyGoals = $('.empty-state', $('#goalList'));
  if (emptyGoals) emptyGoals.remove();
  $('#goalList').append(card);
  updateJar();
  const count = $('#goals .heading-count');
  count.textContent = Number(count.textContent) + 1;
  $('#goalsNavCount').textContent = count.textContent;
  closeModal();
  $('#goalForm').reset();
  showToast(`${name} is planted as a new goal 🌱`);
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

$('#goalDepositForm').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!activeGoalCard) return;
  const amount = Number($('#goalDepositAmount').value);
  const saved = Number(activeGoalCard.dataset.saved);
  const target = Number(activeGoalCard.dataset.target);
  if (!Number.isFinite(amount) || amount <= 0) return;
  const added = Math.min(amount, Math.max(0, target - saved));
  if (added <= 0) {
    showToast('That goal is already reached ✦');
    closeGoalDepositModal();
    return;
  }
  activeGoalCard.dataset.saved = saved + added;
  updateGoalCard(activeGoalCard);
  const goalName = activeGoalCard.dataset.goal;
  updateBalance(-added);
  recordWeeklySaving(added);
  addActivity({ title: `Goal deposit · ${goalName}`, amount: -added, icon: '↘', kind: 'icon-coral' });
  closeGoalDepositModal();
  showToast(`${money(added)} added to ${goalName} — nice progress!`);
});

document.addEventListener('click', (event) => {
  const depositGoal = event.target.closest('.deposit-goal');
  if (depositGoal) openGoalDepositModal(depositGoal.closest('.goal-card'));
  const edit = event.target.closest('.edit-goal');
  if (edit) showToast('Goal editing is ready for your next update');
  const debtPaid = event.target.closest('.mark-debt-paid');
  if (debtPaid && !debtPaid.classList.contains('is-paid')) {
    const row = debtPaid.closest('.debt-row');
    const amount = Number(row.dataset.debtAmount);
    const debtName = row.querySelector('.debt-name strong').textContent;
    debtPaid.classList.add('is-paid');
    debtPaid.textContent = '✓';
    row.classList.add('paid-row');
    row.dataset.paid = 'true';
    const status = row.querySelector('.debt-status');
    status.textContent = 'paid';
    status.className = 'debt-status paid';
    updateBalance(-amount);
    addActivity({ title: `Paid · ${debtName}`, amount: -amount, icon: '↘', kind: 'icon-coral' });
    updateDebtSummary();
    updatePlanSummary();
    showToast('Marked paid — one less thing to carry ✓');
  }
  const paid = event.target.closest('.mark-paid');
  if (paid && !paid.classList.contains('is-paid')) {
    const row = paid.closest('.plan-row');
    const amount = Number(row.dataset.planAmount);
    const planName = row.querySelector('.plan-name strong').textContent;
    paid.classList.add('is-paid');
    paid.textContent = '✓';
    row.classList.add('paid-row');
    row.dataset.paid = 'true';
    const status = row.querySelector('.plan-status');
    status.textContent = 'paid';
    status.className = 'plan-status paid';
    updateBalance(-amount);
    addActivity({ title: `Paid · ${planName}`, amount: -amount, icon: '↘', kind: 'icon-coral' });
    showToast('Plan marked as paid ✓');
    updatePlanSummary();
  }
});

function goToSection(sectionId) {
  const target = document.getElementById(sectionId);
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

$$('[data-scroll]').forEach((button) => button.addEventListener('click', () => goToSection(button.dataset.scroll)));
$$('.nav-link[data-section]').forEach((link) => link.addEventListener('click', () => {
  $$('.nav-link[data-section]').forEach((item) => item.classList.remove('active'));
  link.classList.add('active');
}));

$('#celebrateButton').addEventListener('click', () => {
  showToast('Tiny win unlocked! Keep going ✨');
  $('#celebrateButton').textContent = 'You did it! ✦';
});
$('#tipAction').addEventListener('click', (event) => {
  event.currentTarget.textContent = 'Nice! ✓';
  showToast('You’re building a great money habit');
});
$('#helpButton').addEventListener('click', () => showToast('Start with a goal, then add deposits as you go'));
$('#addPlanButton').addEventListener('click', openPlanModal);
$('#addDebtButton').addEventListener('click', openDebtModal);
updateJar();
updateDebtSummary();
renderWeeklyChart();
