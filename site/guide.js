const buttons = [...document.querySelectorAll('[data-guide-choice]')];
function select(platform) {
  document.documentElement.dataset.guidePlatform = platform;
  buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.guideChoice === platform)));
}
buttons.forEach(button => button.addEventListener('click', () => select(button.dataset.guideChoice)));
const coarse = window.matchMedia('(pointer: coarse)').matches;
select(window.matchMedia('(max-width: 767px)').matches ? 'phone' : coarse ? 'tablet' : 'web');
