const STORE_KEY = 'booknest_books_v2';
const LEGACY_KEY = 'bookManagerPro_books';
const STATUS = { want: 'To read', reading: 'Reading', done: 'Finished' };
const COVER_COLORS = ['#2f5d46', '#8a3b2b', '#30476b', '#6b4a8a', '#7a6420', '#1f5f63', '#5c3a2e'];

class BookNest {
  constructor() {
    this.books = this.load();
    this.filter = 'all';
    this.query = '';
    this.sort = 'recent';
    this.matches = [];
    this.active = -1;
    this.lastRemoved = null;

    this.el = {
      form: document.getElementById('addForm'),
      input: document.getElementById('titleInput'),
      suggest: document.getElementById('suggest'),
      spinner: document.getElementById('spinner'),
      books: document.getElementById('books'),
      empty: document.getElementById('empty'),
      summary: document.getElementById('summary'),
      find: document.getElementById('findInput'),
      sort: document.getElementById('sortSelect'),
      tabs: document.querySelectorAll('[data-filter]'),
      toast: document.getElementById('toast'),
      toastText: document.getElementById('toastText'),
      toastAction: document.getElementById('toastAction'),
    };

    this.bind();
    this.render();
  }

  // ── Storage ──
  load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY));
      if (Array.isArray(saved)) return saved;
      // Carry over books saved by the first version of the app.
      const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY)) || [];
      return legacy.map(b => ({
        id: String(b.id), title: b.title, author: '', cover: '', pages: 0, page: 0,
        status: b.read ? 'done' : 'want', rating: 0, addedAt: b.createdAt || new Date().toISOString(),
        finishedAt: b.read ? b.createdAt : null,
      }));
    } catch (e) {
      return [];
    }
  }
  save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(this.books)); } catch (e) {}
  }

  // ── Events ──
  bind() {
    let timer;
    this.el.input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = this.el.input.value.trim();
      if (q.length < 3) return this.closeSuggest();
      timer = setTimeout(() => this.lookup(q), 300);
    });
    this.el.input.addEventListener('keydown', e => this.onComboKey(e));
    this.el.input.addEventListener('blur', () => setTimeout(() => this.closeSuggest(), 150));
    this.el.suggest.addEventListener('mousedown', e => e.preventDefault());
    this.el.suggest.addEventListener('click', e => {
      const li = e.target.closest('[data-i]');
      if (li) this.addFromMatch(this.matches[+li.dataset.i]);
    });
    this.el.form.addEventListener('submit', e => {
      e.preventDefault();
      if (this.active >= 0 && this.matches[this.active]) return this.addFromMatch(this.matches[this.active]);
      const title = this.el.input.value.trim();
      if (!title) return this.el.input.focus();
      this.add({ title });
    });

    this.el.tabs.forEach(t => t.addEventListener('click', () => { this.filter = t.dataset.filter; this.render(); }));
    this.el.find.addEventListener('input', () => { this.query = this.el.find.value.trim().toLowerCase(); this.render(); });
    this.el.sort.addEventListener('change', () => { this.sort = this.el.sort.value; this.render(); });

    this.el.books.addEventListener('change', e => {
      const book = this.bookFor(e.target);
      if (!book) return;
      if (e.target.matches('.status')) this.setStatus(book, e.target.value);
      if (e.target.matches('.page-num, .page-range')) this.setPage(book, +e.target.value, true);
      if (e.target.matches('.total-num')) { book.pages = Math.max(0, +e.target.value || 0); this.save(); this.render(); }
    });
    this.el.books.addEventListener('input', e => {
      const book = this.bookFor(e.target);
      if (book && e.target.matches('.page-range')) this.setPage(book, +e.target.value, false, e.target.closest('.book'));
    });
    this.el.books.addEventListener('click', e => {
      const book = this.bookFor(e.target);
      if (!book) return;
      const star = e.target.closest('[data-star]');
      if (star) {
        const n = +star.dataset.star;
        book.rating = book.rating === n ? 0 : n;
        this.save(); this.render();
      }
      if (e.target.closest('.remove')) this.remove(book);
      if (e.target.closest('.set-total')) {
        const n = parseInt(prompt(`How many pages does “${book.title}” have?`, ''), 10);
        if (n > 0) { book.pages = n; this.save(); this.render(); }
      }
    });
    this.el.empty.addEventListener('click', e => {
      if (e.target.closest('[data-clear]')) {
        this.filter = 'all'; this.query = ''; this.el.find.value = ''; this.render();
      }
      if (e.target.closest('[data-focus]')) this.el.input.focus();
    });
    this.el.toastAction.addEventListener('click', () => this.undo());
  }

  bookFor(target) {
    const li = target.closest('[data-id]');
    return li && this.books.find(b => b.id === li.dataset.id);
  }

  // ── Open Library lookup ──
  async lookup(q) {
    this.el.spinner.hidden = false;
    const ctrl = this.lookupCtrl = new AbortController();
    try {
      const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=6&fields=key,title,author_name,cover_i,number_of_pages_median,first_publish_year`;
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      if (ctrl !== this.lookupCtrl) return;
      this.matches = data.docs.map(d => ({
        title: d.title,
        author: (d.author_name || []).slice(0, 2).join(', '),
        cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : '',
        pages: d.number_of_pages_median || 0,
        year: d.first_publish_year || '',
      }));
      this.showSuggest(q);
    } catch (err) {
      if (err.name === 'AbortError') return;
      this.matches = [];
      this.showSuggest(q, "Couldn't reach Open Library. Press Add to shelf to add the title as typed.");
    } finally {
      if (ctrl === this.lookupCtrl) this.el.spinner.hidden = true;
    }
  }

  showSuggest(q, note) {
    this.active = -1;
    const items = this.matches.map((m, i) => `
      <li role="option" id="opt-${i}" data-i="${i}" aria-selected="false">
        ${m.cover ? `<img src="${m.cover}" alt="" loading="lazy">` : '<span class="mini-cover"></span>'}
        <span><strong>${this.esc(m.title)}</strong><small>${this.esc([m.author, m.year].filter(Boolean).join(' · ') || 'Unknown author')}</small></span>
      </li>`).join('');
    this.el.suggest.innerHTML = items || `<li class="note">${note || `No matches for “${this.esc(q)}”. Press Add to shelf to add it anyway.`}</li>`;
    this.el.suggest.hidden = false;
    this.el.input.setAttribute('aria-expanded', 'true');
  }
  closeSuggest() {
    if (this.lookupCtrl) this.lookupCtrl.abort();
    this.el.spinner.hidden = true;
    this.el.suggest.hidden = true;
    this.el.input.setAttribute('aria-expanded', 'false');
    this.el.input.removeAttribute('aria-activedescendant');
    this.active = -1;
  }
  onComboKey(e) {
    if (this.el.suggest.hidden || !this.matches.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = this.matches.length;
      this.active = e.key === 'ArrowDown' ? (this.active + 1) % n : (this.active - 1 + n) % n;
      this.el.suggest.querySelectorAll('[data-i]').forEach((li, i) => li.setAttribute('aria-selected', i === this.active));
      this.el.input.setAttribute('aria-activedescendant', 'opt-' + this.active);
      this.el.suggest.querySelector(`#opt-${this.active}`).scrollIntoView({ block: 'nearest' });
    }
    if (e.key === 'Escape') this.closeSuggest();
  }
  addFromMatch(m) { this.add(m); }

  // ── Mutations ──
  add({ title, author = '', cover = '', pages = 0 }) {
    const dupe = this.books.find(b => b.title.toLowerCase() === title.toLowerCase() && (b.author || '') === author);
    if (dupe) return this.toast(`“${title}” is already on your shelf`);
    const book = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      title, author, cover, pages, page: 0, status: 'want', rating: 0,
      addedAt: new Date().toISOString(), finishedAt: null,
    };
    this.books.unshift(book);
    this.save();
    this.el.input.value = '';
    this.closeSuggest();
    if (this.filter !== 'all' && this.filter !== 'want') this.filter = 'all';
    this.render();
    this.toast(`Added “${title}”`);
  }

  setStatus(book, status) {
    book.status = status;
    if (status === 'done') {
      book.finishedAt = new Date().toISOString();
      if (book.pages) book.page = book.pages;
      this.toast(`Finished “${book.title}”. Give it a rating?`);
    } else {
      book.finishedAt = null;
      if (status === 'want') book.page = 0;
    }
    this.save();
    this.render();
  }

  setPage(book, n, commit, card) {
    const max = book.pages || 9999;
    book.page = Math.max(0, Math.min(max, n || 0));
    if (card) {
      card.querySelector('.page-num').value = book.page;
    }
    if (!commit) return;
    if (book.pages && book.page >= book.pages && book.status !== 'done') return this.setStatus(book, 'done');
    if (book.page > 0 && book.status === 'want') book.status = 'reading';
    this.save();
    this.render();
  }

  remove(book) {
    const idx = this.books.indexOf(book);
    const card = this.el.books.querySelector(`[data-id="${book.id}"]`);
    const finish = () => {
      this.books.splice(this.books.indexOf(book), 1);
      this.lastRemoved = { book, idx };
      this.save();
      this.render();
      this.toast(`Removed “${book.title}”`, true);
    };
    if (card && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      card.classList.add('leaving');
      card.addEventListener('animationend', finish, { once: true });
    } else finish();
  }
  undo() {
    if (!this.lastRemoved) return;
    const { book, idx } = this.lastRemoved;
    this.books.splice(Math.min(idx, this.books.length), 0, book);
    this.lastRemoved = null;
    this.save();
    this.render();
    this.toast(`Put “${book.title}” back`);
  }

  // ── Rendering ──
  visible() {
    let list = this.books.filter(b =>
      (this.filter === 'all' || b.status === this.filter) &&
      (!this.query || (b.title + ' ' + b.author).toLowerCase().includes(this.query)));
    const pct = b => b.status === 'done' ? 1 : b.pages ? b.page / b.pages : 0;
    if (this.sort === 'title') list = [...list].sort((a, b) => a.title.localeCompare(b.title));
    if (this.sort === 'author') list = [...list].sort((a, b) => (a.author || '~').localeCompare(b.author || '~'));
    if (this.sort === 'progress') list = [...list].sort((a, b) => pct(b) - pct(a));
    return list;
  }

  render() {
    const counts = { all: this.books.length, want: 0, reading: 0, done: 0 };
    this.books.forEach(b => counts[b.status]++);
    document.querySelectorAll('[data-n]').forEach(s => { s.textContent = counts[s.dataset.n] || ''; });
    this.el.tabs.forEach(t => t.setAttribute('aria-selected', t.dataset.filter === this.filter));
    this.el.summary.innerHTML = this.summary(counts);

    const list = this.visible();
    this.el.books.innerHTML = list.map(b => this.card(b)).join('');
    this.el.empty.hidden = list.length > 0;
    if (!list.length) {
      this.el.empty.innerHTML = this.books.length
        ? `<h3>Nothing here</h3><p>No books match this filter${this.query ? ' and search' : ''}.</p><button class="btn" data-clear>Show all books</button>`
        : `<h3>Your shelf is empty</h3><p>Search for a book above. Pick a match to add it with its cover and page count.</p><button class="btn" data-focus>Find a book</button>`;
    }
  }

  summary(c) {
    if (!c.all) return 'Your shelf is empty. Find a book below to start.';
    const pagesRead = this.books.reduce((n, b) => n + (b.page || 0), 0);
    const reading = this.books.filter(b => b.status === 'reading');
    let s = `<b>${c.all}</b> book${c.all === 1 ? '' : 's'} on your shelf, <b>${c.done}</b> finished`;
    if (pagesRead) s += `, <b>${pagesRead.toLocaleString()}</b> pages read`;
    s += '.';
    if (reading.length) s += ` You're reading <b>${this.esc(reading[0].title)}</b>${reading.length > 1 ? ` and ${reading.length - 1} more` : ''}.`;
    return s;
  }

  coverHTML(b) {
    if (b.cover) return `<div class="cover"><img src="${b.cover}" alt="" loading="lazy" onerror="this.parentElement.outerHTML=window.bookNest.madeCover(window.bookNest.books.find(x=>x.id==='${b.id}'))"></div>`;
    return this.madeCover(b);
  }
  madeCover(b) {
    const hash = [...b.title].reduce((h, ch) => h * 31 + ch.charCodeAt(0) | 0, 7);
    const color = COVER_COLORS[Math.abs(hash) % COVER_COLORS.length];
    return `<div class="cover made" style="background:${color}" aria-hidden="true"><span>${this.esc(b.title.slice(0, 48))}</span><small>${this.esc(b.author || '')}</small></div>`;
  }

  card(b) {
    const statusOpts = Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${b.status === k ? 'selected' : ''}>${v}</option>`).join('');
    let extra = '';
    if (b.status === 'reading') {
      extra = b.pages
        ? `<div class="pages">
            <div class="pages-row">
              <input class="page-range" type="range" min="0" max="${b.pages}" value="${b.page}" aria-label="Pages read">
              <input class="page-num" type="number" min="0" max="${b.pages}" value="${b.page}" aria-label="Current page">
              <span class="pages-total">/ ${b.pages}</span>
            </div>
          </div>`
        : `<div class="pages">
            <div class="pages-row">On page <input class="page-num" type="number" min="0" value="${b.page}" aria-label="Current page">
            <button class="set-total">Set page count</button></div>
          </div>`;
    }
    if (b.status === 'done') {
      extra = `<div class="stars" role="group" aria-label="Your rating">${[1, 2, 3, 4, 5].map(n =>
        `<button data-star="${n}" class="${n <= b.rating ? 'on' : ''}" aria-label="${n} star${n > 1 ? 's' : ''}" aria-pressed="${n === b.rating}"><svg viewBox="0 0 24 24"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"/></svg></button>`).join('')}</div>
        ${b.finishedAt ? `<p class="finished-on">Finished ${new Date(b.finishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</p>` : ''}`;
    }
    return `<li class="book" data-id="${b.id}">
      ${this.coverHTML(b)}
      <div class="book-body">
        <h3 class="book-title">${this.esc(b.title)}</h3>
        <p class="book-author">${this.esc(b.author || 'Unknown author')}${b.pages && b.status !== 'reading' ? ` · ${b.pages} pages` : ''}</p>
        <label class="sr-only" for="st-${b.id}">Status</label>
        <select id="st-${b.id}" class="status ${b.status}">${statusOpts}</select>
        ${extra}
      </div>
      <button class="remove" aria-label="Remove ${this.esc(b.title)}"><svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg></button>
    </li>`;
  }

  toast(msg, undo = false) {
    this.el.toastText.textContent = msg;
    this.el.toastAction.hidden = !undo;
    this.el.toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.el.toast.classList.remove('show');
      if (undo) this.lastRemoved = null;
    }, undo ? 5000 : 2600);
  }

  esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
}

window.bookNest = new BookNest();
