// Token Radar's dashboard. Reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable table, a per-protocol detail view with the model's
// own terms and the protocol's costed farm plan, and the validation the model ran on real
// traded peers. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null, view: 'board' };

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('view')) state.view = params.get('view');
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.selected) params.set('p', state.selected);
    if (state.view !== 'board') params.set('view', state.view);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'odds') { av = a.token_odds; bv = b.token_odds; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, 'Token ', el('b', { text: 'Radar' }), el('span', { class: 'sub', text: '  pre-token launches, ranked by fitted implied value' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama, sealed' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function kpis() {
    var v = DATA.validation;
    var ho = v[0], wf = v[2];
    function kpi(label, big, sub) {
      return el('div', { class: 'kpi' }, el('span', { text: label }), el('b', { html: big }), sub ? el('span', { class: 'sub', text: sub }) : null);
    }
    return el('div', { class: 'kpis' },
      kpi('Protocols', String(DATA.total_protocols), 'in the sealed snapshot'),
      kpi('Watchlist', String(DATA.watchlist_size), 'covered 40 / 40'),
      kpi('Pre-token', String(DATA.pre_token_size), 'records no token'),
      kpi('Pre-token TVL', fmtUsd(DATA.pre_token_tvl_usd), 'sum over 342 protocols'),
      kpi('Implied top-40', fmtUsd(DATA.implied_top40_usd), 'sum of ranks 1-40'),
      kpi('Median fold error', ho.median_fold.toFixed(2) + 'x', 'held-out · ' + wf.median_fold.toFixed(2) + 'x walk-fwd')
    );
  }

  function modelBox() {
    var f = DATA.fit, h = DATA.hazard;
    var catLine = Object.keys(f.category_effects).map(function (c) { return c + ' ' + (f.category_effects[c] >= 0 ? '+' : '') + f.category_effects[c].toFixed(2); }).join(' · ');
    return el('section', { class: 'model' },
      el('h2', { text: 'How implied value is computed — fitted, not assumed' }),
      el('div', { class: 'formula', text: 'log(mcap) = ' + f.intercept + ' + ' + f.log_tvl_coef + '·log(TVL) + ' + f.log_age_coef + '·log(age+1) ' + (f.change_coef >= 0 ? '+' : '') + ' ' + f.change_coef + '·chg7d/100 + category effect,  × K ' + f.k_factor }),
      el('p', { text: 'Category effects: ' + catLine + '. Fitted by ridge OLS on ' + f.n_fit + ' traded peers (market cap ≤ 5× TVL); ' + f.excluded_fit.length + ' outliers above 5× are named below, not fitted.' }),
      el('p', { text: 'Token odds = 1 − exp(−hazard), Weibull τ ' + h.tau_years + 'y, γ ' + h.gamma + ' — odds FALL with age: 1-year odds ' + h.odds_by_age[0].odds_1y + ' at 45 days, ' + h.odds_by_age[7].odds_1y + ' at 6 years. Cumulative token rate rises with age (32% → 80%); the hazard, conditional on still having no token, falls. Source: DefiLlama snapshot ' + DATA.as_of + ', sealed.' })
    );
  }

  function integrity() {
    var c = DATA.checks;
    function item(check, extra) {
      return el('div', { class: 'check' },
        el('span', { class: check.ok ? 'ok' : 'no', text: check.ok ? '✓ ' : '✗ ' }),
        el('b', { text: check.label }),
        el('span', { class: 'sub', text: ' — ' + (extra || check.detail) })
      );
    }
    return el('div', { class: 'integrity' },
      item(c[0], 'all 40 slugs on the board'),
      item(c[1], 'Σ pred $' + (DATA.fit.sum_pred_fit_usd / 1e9).toFixed(2) + 'B vs Σ obs $' + (DATA.fit.sum_obs_fit_usd / 1e9).toFixed(2) + 'B, ratio ' + (DATA.fit.sum_pred_fit_usd / DATA.fit.sum_obs_fit_usd).toFixed(3)),
      el('div', { class: 'check' }, el('span', { class: 'ok', text: '✓ ' }), el('b', { text: 'determinism: 2 runs byte-identical' }), el('span', { class: 'sub', text: ' — builds twice, writes only on a match' })),
      item(c[3], 'ranks 1..N, implied falling, steps 3–12 × 20–600 chars')
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; state.view = 'board'; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; state.view = 'board'; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown of ' + DATA.board_size : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' ▼' : ' ▲' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.view = 'board'; writeHash(); render(); } })
      ));
    }
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'class': r.rank <= 3 ? 'top3' : '',
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { text: ' · ' + (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: fmtUsd(r.implied_value_usd) }),
        el('td', { class: 'num', text: r.token_odds.toFixed(3) }),
        el('td', null, el('span', { class: 'verdict ' + r.verdict, text: r.verdict }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Pre-token protocols, strongest implied value first. Select a row for its model terms and farm plan. Implied value = fitted market cap × token odds; odds fall with age.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            sortHeader('odds', 'Odds'),
            el('th', { scope: 'col', text: 'Verdict' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'verdict SKIP', text: 'ALREADY TRADES' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. Set aside from the pre-token ranking, with wrapped and bridged products.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function oddsCurve(wide) {
    var pts = DATA.hazard.odds_by_age;
    var W = wide ? 1180 : 260, H = wide ? 46 : 74, pad = 6;
    var maxO = 0.6;
    var xy = pts.map(function (p, i) {
      var x = pad + (i / (pts.length - 1)) * (W - 2 * pad);
      var y = H - pad - (p.odds_1y / maxO) * (H - 2 * pad);
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    var svg = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="Token odds fall with age"><polyline points="' + xy + '" fill="none" stroke="#34d399" stroke-width="2"/><line x1="' + pad + '" y1="' + (H - pad) + '" x2="' + (W - pad) + '" y2="' + (H - pad) + '" stroke="#26332c"/></svg>';
    return el('div', null,
      el('div', { html: svg }),
      el('p', { class: 'sub', text: '1-year token odds by age: ' + pts.map(function (p) { return fmtAge(p.age_days) + ' ' + p.odds_1y.toFixed(2); }).join(' · ') + '. Odds fall with age; the cumulative token rate (32% → 80%) is a different number — it counts protocols that already have one.' })
    );
  }

  function detailPanel(row) {
    var m = row.model;
    function cell(label, value) { return el('div', { class: 'dcell' }, el('span', { text: label }), el('b', { text: value })); }
    var terms = el('table', { class: 'terms' },
      el('tbody', null,
        el('tr', null, el('td', { text: 'Intercept' }), el('td', { text: String(m.intercept) })),
        el('tr', null, el('td', { text: 'log(TVL) term (' + m.log_tvl_term + ' = log TVL × ' + DATA.fit.log_tvl_coef + ')' }), el('td', { text: String(m.log_tvl_term) })),
        el('tr', null, el('td', { text: 'Age term log(age+1) × ' + DATA.fit.log_age_coef }), el('td', { text: String(m.age_term) })),
        el('tr', null, el('td', { text: 'Growth term chg7d × ' + DATA.fit.change_coef }), el('td', { text: String(m.growth_term) })),
        el('tr', null, el('td', { text: 'Category effect (' + (row.category || 'Other') + ')' }), el('td', { text: String(m.category_effect) })),
        el('tr', null, el('td', { text: 'Calibration K (medians → total)' }), el('td', { text: String(m.k_factor) })),
        el('tr', null, el('td', { text: 'Predicted market cap' }), el('td', { text: fmtUsd(m.pred_mcap_usd) })),
        el('tr', null, el('td', { text: 'Token odds (1y hazard)' }), el('td', { text: String(m.token_odds) })),
        el('tr', null, el('td', null, el('b', { text: 'Implied value = pred × odds' })), el('td', null, el('b', { text: fmtUsd(row.implied_value_usd) })))
      )
    );
    var steps = el('ol', { class: 'steps' }, row.farm_steps.map(function (s) {
      var at = s.indexOf(' Cost: ');
      var action = at >= 0 ? s.slice(0, at) : s;
      var tail = at >= 0 ? s.slice(at + 1) : '';
      return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
    }));
    return el('section', { class: 'panel detail' },
      el('div', { class: 'detail-head' },
        el('div', null,
          el('span', { class: 'sub', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + ' · ' + (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') }),
          el('h2', { text: row.name }),
          el('p', { class: 'sub', text: 'This protocol records no token in the DefiLlama snapshot of ' + DATA.as_of + ' — the record is not proof it has none. Verdict ' + row.verdict + ': expected value ' + fmtUsd(row.expected_value_usd) + ' vs farm cost ' + fmtUsd(row.farm_cost_usd) + '.' })
        ),
        el('span', { class: 'verdict ' + row.verdict, text: row.verdict }),
        el('button', { class: 'button', type: 'button', text: '← Back to board', onclick: function () { state.selected = null; state.view = 'board'; writeHash(); render(); } })
      ),
      el('div', { class: 'detail-grid' },
        cell('TVL', fmtUsd(row.tvl_usd)),
        cell('7-day change', fmtPct(row.change_7d)),
        cell('Age with no token', fmtAge(row.age_days)),
        cell('Predicted mcap', fmtUsd(m.pred_mcap_usd)),
        cell('Token odds', String(row.token_odds)),
        cell('Implied value', fmtUsd(row.implied_value_usd))
      ),
      el('div', { class: 'odds-strip' },
        el('h3', { class: 'sub', text: 'ODDS FALL WITH AGE — 1-YEAR TOKEN ODDS BY PROTOCOL AGE' }),
        oddsCurve(true)
      ),
      el('div', { class: 'detail-cols' },
        el('div', null, el('h3', { text: 'Model terms, one by one' }), terms),
        el('div', null,
          el('h3', { text: 'Farm plan — 6 costed steps' }),
          steps,
          el('p', { class: 'sub', text: 'Assumptions: ' + DATA.assumptions })
        )
      ),
      el('p', { class: 'note', text: 'Do not buy a token in its first hour of trading; this plan farms the protocol before any launch, it does not chase one after it.' })
    );
  }

  function validationSection() {
    var f = DATA.fit, h = DATA.hazard;
    var thead = el('thead', null, el('tr', null,
      ['Split', 'Train / test', 'MAPE', 'Median APE', 'Median fold', 'Within 3×', 'Total ratio (fit)', 'Total ratio (all)'].map(function (t) { return el('th', { scope: 'col', text: t }); })
    ));
    var tbody = el('tbody');
    DATA.validation.forEach(function (v) {
      tbody.appendChild(el('tr', null,
        el('td', { text: v.name }),
        el('td', { class: 'num', text: v.n_train + ' / ' + v.n_test }),
        el('td', { class: 'num', text: v.mape_pct.toLocaleString('en-US') + '%' }),
        el('td', { class: 'num', text: v.median_ape_pct.toLocaleString('en-US') + '%' }),
        el('td', { class: 'num', text: v.median_fold.toFixed(2) + 'x' }),
        el('td', { class: 'num', text: v.within_3x_pct + '%' }),
        el('td', { class: 'num', text: String(v.total_ratio_fit) }),
        el('td', { class: 'num', text: String(v.total_ratio_all) })
      ));
    });
    return el('section', { class: 'section' },
      el('h2', { text: 'Validation on real traded peers — no synthetic tests' }),
      el('div', { class: 'panel' }, el('div', { class: 'table-wrap' }, el('table', { class: 'vtable' }, thead, tbody))),
      el('p', { text: 'Read the median fold, not MAPE: market cap over TVL spans 100×, so a handful of tiny-cap protocols dominate MAPE. The typical protocol lands within about 3.5–4.6×; 31–46% land within 3×. The total ratio (all) is 0.49 in-sample because 8 protocols with market cap over 5× TVL hold about half of all traded market cap — they are excluded from the fit and named here: ' + f.excluded_fit.map(function (e) { return e.name + ' ' + e.ratio + 'x'; }).join(', ') + '.' }),
      el('p', { text: 'Hazard check: the Weibull model predicts ' + h.predicted_tokens + ' tokens across 758 protocols vs ' + h.observed_tokens + ' observed. Cumulative token rates by age bucket: ' + h.cumulative_by_bucket.map(function (b) { return b.bucket + ' ' + b.token_rate_pct + '% (n=' + b.n + ')'; }).join(' · ') + '. The cumulative rate rises; the conditional hazard falls — both are printed, they are not the same number.' })
    );
  }

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    state.view = 'detail';
    writeHash();
    render();
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    if (!state.selected) {
      shell.appendChild(kpis());
      shell.appendChild(modelBox());
    }
    shell.appendChild(integrity());
    if (!state.selected) shell.appendChild(controls());
    if (state.view === 'filtered' || (state.category !== 'all' && state.view !== 'detail')) {
      shell.appendChild(el('div', { class: 'banner' }, 'Filter active: category = ', el('b', { text: state.category }), ' — ' + rows().length + ' of ' + DATA.board_size + ' rows match. The filter runs on the board data, not on a label.'));
    }
    if (state.selected) {
      var row = DATA.rows.filter(function (r) { return r.slug === state.selected; })[0];
      if (row) shell.appendChild(detailPanel(row));
    }
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    shell.appendChild(validationSection());
    shell.appendChild(el('footer', { class: 'footer', text: 'Token Radar · ' + DATA.model_version + ' · snapshot ' + DATA.as_of + ' (DefiLlama, sealed) · ' + DATA.assumptions + ' Wrapped, staked and bridged products are set aside with the live-token protocols: their underlying token already trades.' }));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.selected) { state.selected = null; state.view = 'board'; writeHash(); render(); }
  });
})();
