(function () {
  var config = window.OWNERBOT || {};
  var siteId = typeof config.siteId === 'string' ? config.siteId.trim() : '';
  config.siteId = siteId;
  var hasWorkspace = !!siteId;

  var root = document.querySelector('#ownerbot-root');
  if (!root) {
    console.warn('[OwnerBot] Cannot find #ownerbot-root placeholder.');
    return;
  }

  var DEFAULT_ENDPOINT = 'https://app.quantumowner.ai/api/quantumbot';
  config.apiEndpoint =
    typeof config.apiEndpoint === 'string' && config.apiEndpoint.trim()
      ? config.apiEndpoint.trim()
      : DEFAULT_ENDPOINT;
  var hasEndpoint = !!config.apiEndpoint;
  config.aiKey = typeof config.aiKey === 'string' ? config.aiKey.trim() : '';
  config.faqEndpoint = config.faqEndpoint || '/api/faq';
  config.fuseUrl = config.fuseUrl || '/widget/fuse.min.js';

  var CHAT_URL = hasEndpoint ? config.apiEndpoint : '';
  var LOGO_URL = config.logoUrl || '/logo.svg';
  var BRAND_GRADIENT = 'linear-gradient(135deg, #0f172a 0%, #1d4ed8 55%, #22d3ee 100%)';
  var IS_DEFAULT_LOGO = typeof LOGO_URL === 'string' && LOGO_URL.indexOf('woo-chatbot/assets/logo.svg') !== -1;
  var wooKeys =
    config.wooKeys && config.wooKeys.consumerKey && config.wooKeys.consumerSecret ? config.wooKeys : null;
  var storeSnapshot =
    config.storeSnapshot && typeof config.storeSnapshot === 'object' ? config.storeSnapshot : null;
  var storeUrl =
    typeof config.storeUrl === 'string' && config.storeUrl.trim()
      ? config.storeUrl
      : typeof window !== 'undefined' && window.location
      ? window.location.origin
      : '';

  var state = {
    open: false,
    sending: false,
    locale: resolveLocale(config.locale),
    messages: [],
    billing: { state: 'trial', remainingDays: null, trialEndsAt: null, buyUrl: null },
    faqMap: { pl: [], en: [] },
    fuse: null,
    faqReady: false,
    lastFocused: null,
    llmEnabled: false,
    pendingAttachment: null,
  };

  var fuseOptions = {
    keys: ['q', 'aliases', 'tags'],
    threshold: 0.42,
    ignoreLocation: true,
    minMatchCharLength: 2,
    distance: 150,
    shouldSort: true,
  };

  var fuseQueue = [];
  var fuseLoading = false;

  pushMessage('bot', copy().intro, 'info');
  hydrate();
  loadFaq();
  ensureFuse(createFuseIfPossible);
  render();

  function createLogoBadge(size, options) {
    options = options || {};
    var badge = document.createElement('span');
    badge.style.display = 'inline-flex';
    badge.style.alignItems = 'center';
    badge.style.justifyContent = 'center';
    badge.style.width = size + 'px';
    badge.style.height = size + 'px';
    badge.style.borderRadius = options.radius || '999px';
    var defaultBackground = IS_DEFAULT_LOGO ? BRAND_GRADIENT : '#ffffff';
    badge.style.background = typeof options.background === 'string' ? options.background : defaultBackground;
    var defaultBorder = IS_DEFAULT_LOGO ? 'none' : '1px solid rgba(15, 23, 42, 0.08)';
    badge.style.border = options.border === false ? 'none' : defaultBorder;
    badge.style.boxShadow = options.shadow === false ? 'none' : '0 12px 24px rgba(15, 23, 42, 0.18)';
    badge.style.overflow = 'hidden';

    if (LOGO_URL) {
      var img = document.createElement('img');
      img.src = LOGO_URL;
      img.alt = 'Quantum Assist';
      img.style.width = '78%';
      img.style.height = '78%';
      img.style.objectFit = 'contain';
      badge.appendChild(img);
    } else {
      var initials = document.createElement('strong');
      initials.textContent = 'QA';
      initials.style.fontFamily = 'Inter, "Segoe UI", system-ui, -apple-system, sans-serif';
      initials.style.fontWeight = '700';
      initials.style.fontSize = Math.max(12, size * 0.4) + 'px';
      initials.style.letterSpacing = '0.08em';
      initials.style.color = '#ffffff';
      badge.appendChild(initials);
    }

    return badge;
  }

  function ensureFuse(callback) {
    if (typeof window.Fuse === 'function') {
      if (typeof callback === 'function') {
        callback();
      }
      return;
    }

    if (typeof callback === 'function') {
      fuseQueue.push(callback);
    }

    if (fuseLoading) {
      return;
    }

    fuseLoading = true;
    var script = document.createElement('script');
    script.src = config.fuseUrl;
    script.async = true;
    script.onload = function () {
      fuseLoading = false;
      createFuseIfPossible();
      while (fuseQueue.length) {
        var cb = fuseQueue.shift();
        if (typeof cb === 'function') {
          cb();
        }
      }
    };
    script.onerror = function (error) {
      fuseLoading = false;
      fuseQueue = [];
      console.error('[OwnerBot] Failed to load Fuse.js', error);
    };
    document.head.appendChild(script);
  }

  function loadFaq() {
    fetch(config.faqEndpoint, { cache: 'force-cache' })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('Failed to fetch FAQ dataset');
        }
        return response.json();
      })
      .then(function (data) {
        var normalized = { pl: [], en: [] };
        function normalize(list) {
          return list.map(function (entry) {
            var baseAliases = Array.isArray(entry.aliases) ? entry.aliases : [];
            var normalizedAliases = baseAliases.map(normalizeText).filter(Boolean);
            normalizedAliases.push(normalizeText(entry.q));
            return {
              q: entry.q,
              a: entry.a,
              aliases: baseAliases.concat(normalizedAliases),
              tags: Array.isArray(entry.tags) ? entry.tags : [],
            };
          });
        }

        if (data && Array.isArray(data.pl) && Array.isArray(data.en)) {
          normalized = { pl: normalize(data.pl), en: normalize(data.en) };
        } else if (Array.isArray(data)) {
          var shared = normalize(data);
          normalized = { pl: shared, en: shared };
        }

        state.faqMap = normalized;
        state.faqReady = false;
        state.fuse = null;
        createFuseIfPossible();
      })
      .catch(function (error) {
        console.error('[OwnerBot] FAQ load failed', error);
      });
  }

  function getActiveFaq() {
    var list = state.faqMap[state.locale];
    if (!Array.isArray(list)) {
      return [];
    }
    return list;
  }

  function createFuseIfPossible() {
    var dataset = []
      .concat(Array.isArray(state.faqMap.pl) ? state.faqMap.pl : [])
      .concat(Array.isArray(state.faqMap.en) ? state.faqMap.en : []);
    if (!dataset.length || typeof window.Fuse !== 'function') {
      state.faqReady = false;
      return;
    }
    state.fuse = new window.Fuse(dataset, fuseOptions);
    state.faqReady = true;
  }

  function resolveLocale(value) {
    if (value && typeof value === 'string' && value.toLowerCase().startsWith('pl')) {
      return 'pl';
    }
    if (typeof navigator !== 'undefined') {
      return navigator.language && navigator.language.toLowerCase().startsWith('pl') ? 'pl' : 'en';
    }
    return 'pl';
  }

  function pushMessage(role, content, source, attachment) {
    var message = { role: role, content: content, source: source, attachment: attachment || null };
    state.messages.push(message);
    return message;
  }

  function hydrate() {
    var endpoint = config.configEndpoint || (config.shopDomain ? 'https://' + config.shopDomain + '/apps/ownerbot/config' : null);
    if (!endpoint) {
      return;
    }
    fetch(endpoint + '?shop=' + encodeURIComponent(config.shopDomain || ''), { cache: 'no-store' })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('Failed to fetch widget config');
        }
        return response.json();
      })
      .then(function (data) {
        if (data) {
          if (typeof data.themeColor === 'string') {
            config.themeColor = data.themeColor;
          }
          if (typeof data.position === 'string') {
            config.position = data.position;
          }
          if (data.billing) {
            state.billing = {
              state: data.billing.state || 'trial',
              remainingDays: typeof data.billing.remainingDays === 'number' ? data.billing.remainingDays : null,
              trialEndsAt: data.billing.trialEndsAt ? new Date(data.billing.trialEndsAt) : null,
              buyUrl: data.billing.buyUrl || null,
            };
          }
          if (typeof data.llmEnabled === 'boolean') {
            state.llmEnabled = data.llmEnabled;
          }
        }
      })
      .catch(function (error) {
        console.warn('[OwnerBot] Config endpoint error', error);
      })
      .finally(function () {
        render();
      });
  }

  function matchLocalFaq(question) {
    if (!state.faqReady || !state.fuse || !question) {
      return null;
    }
    var trimmed = question.trim();
    if (!trimmed) {
      return null;
    }

    var exact = findExactFaq(trimmed);
    if (exact) {
      return exact;
    }

    var results = state.fuse.search(trimmed, { limit: 1 });
    if (!results || !results.length) {
      results = state.fuse.search(normalizeText(trimmed), { limit: 1 });
    }
    if (!results || !results.length) {
      return null;
    }
    var best = results[0];
    if (!best || typeof best.score !== 'number') {
      return null;
    }
    return best.score <= 0.45 ? best.item : null;
  }

  function handleMessage(question) {
    var text = (question || '').trim();
    var hasAttachment = !!state.pendingAttachment;
    if ((!text && !hasAttachment) || state.sending) {
      return;
    }

    var attachmentPayload = hasAttachment
      ? {
          name: state.pendingAttachment.name,
          type: state.pendingAttachment.type,
          size: state.pendingAttachment.size,
          dataUrl: state.pendingAttachment.dataUrl,
        }
      : null;

    state.pendingAttachment = null;
    state.sending = true;

    var userContent = text || (attachmentPayload ? copy().labels.imagePlaceholder : '');
    pushMessage('user', userContent, undefined, attachmentPayload);
    var pending = pushMessage('bot', copy().thinking, 'info');
    render();
    scrollMessages();

    var localHit = text ? matchLocalFaq(text) : null;
    if (localHit) {
      pending.content = localHit.a;
      pending.source = 'faq';
      state.sending = false;
      render();
      scrollMessages();
      focusInput();
      return;
    }

    sendQuestion(text, attachmentPayload)
      .then(function (result) {
        if (result && typeof result.reply === 'string') {
          pending.content = result.reply;
        } else {
          pending.content = copy().fallback;
        }
        if (result && result.source) {
          pending.source = result.source;
        } else if (result && result.llmEnabled === false) {
          pending.source = 'info';
        } else {
          pending.source = 'ai';
        }
        if (result && result.billing) {
          state.billing = {
            state: result.billing.state || state.billing.state,
            remainingDays: result.billing.remainingDays ?? state.billing.remainingDays,
            trialEndsAt: result.billing.trialEndsAt ? new Date(result.billing.trialEndsAt) : state.billing.trialEndsAt,
            buyUrl: result.billing.buyUrl || state.billing.buyUrl,
          };
        }
      })
      .catch(function () {
        pending.content = copy().fallback;
        pending.source = 'info';
      })
      .finally(function () {
        state.sending = false;
        render();
        scrollMessages();
        focusInput();
      });
  }

  function sendQuestion(question, attachment) {
    var hasAiKey = !!config.aiKey;
    var canUseQuantum = hasEndpoint && hasWorkspace;

    if (canUseQuantum) {
      var quantumPromise = sendQuantumRequest(question, attachment);
      if (hasAiKey) {
        return quantumPromise.catch(function (error) {
          console.warn('[OwnerBot] Quantum endpoint failed, falling back to direct AI', error);
          return sendDirectAi(question);
        });
      }
      return quantumPromise;
    }

    if (hasAiKey) {
      return sendDirectAi(question);
    }

    return Promise.resolve({
      reply: copy().fallback,
      source: 'info',
      llmEnabled: false,
    });
  }

  function sendQuantumRequest(question, attachment) {
    var headers = {
      'Content-Type': 'application/json; charset=utf-8',
      Accept: 'application/json',
    };
    if (config.aiKey) {
      headers.Authorization = 'Bearer ' + config.aiKey;
    }

    return fetch(CHAT_URL, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        message: question,
        locale: state.locale,
        siteId: config.siteId || null,
        attachment: attachment || null,
        wooKeys: wooKeys || null,
        storeUrl: storeUrl || null,
      }),
      credentials: 'same-origin',
    })
      .then(function (response) {
        if (!response.ok) {
          return response.text().then(function (text) {
            throw new Error('Request failed: ' + response.status + ' ' + text);
          });
        }
        return response.json();
      });
  }

  function buildSystemPrompt() {
    var base =
      'You are Quantum Assist, a helpful ecommerce AI assistant. Provide clear, concise answers using the available store data. Always respond in ' +
      (state.locale === 'pl' ? 'Polish' : 'English') +
      '.';
    if (storeSnapshot) {
      base += ' Store context:';
      if (storeSnapshot.store_name) {
        base += ' Store name: ' + storeSnapshot.store_name + '.';
      }
      if (storeSnapshot.currency_code) {
        base += ' Currency: ' + storeSnapshot.currency_code + ' (' + (storeSnapshot.currency_symbol || '') + ').';
      }
      if (Array.isArray(storeSnapshot.shipping_methods) && storeSnapshot.shipping_methods.length) {
        base += ' Shipping: ' + storeSnapshot.shipping_methods.join(', ') + '.';
      }
      if (Array.isArray(storeSnapshot.payment_methods) && storeSnapshot.payment_methods.length) {
        base += ' Payments: ' + storeSnapshot.payment_methods.join(', ') + '.';
      }
      if (Array.isArray(storeSnapshot.top_products) && storeSnapshot.top_products.length) {
        base += ' Popular products: ' + storeSnapshot.top_products.join(', ') + '.';
      }
      if (storeSnapshot.support_email) {
        base += ' Support email: ' + storeSnapshot.support_email + '.';
      }
    }
    return base;
  }

  function sendDirectAi(question) {
    if (!config.aiKey) {
      return Promise.reject(new Error('Missing AI key'));
    }
    var payload = {
      model: config.openAiModel || 'gpt-4o-mini',
      temperature: 0.35,
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: question },
      ],
    };

    return fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + config.aiKey,
      },
      body: JSON.stringify(payload),
    })
      .then(function (response) {
        if (!response.ok) {
          return response.text().then(function (text) {
            throw new Error('OpenAI error: ' + response.status + ' ' + text);
          });
        }
        return response.json();
      })
      .then(function (data) {
        var reply =
          data &&
          data.choices &&
          data.choices[0] &&
          data.choices[0].message &&
          data.choices[0].message.content;
        return {
          reply: reply || copy().fallback,
          source: 'ai',
          llmEnabled: true,
        };
      })
      .catch(function (error) {
        console.error('[OwnerBot] Direct AI request failed', error);
        throw error;
      });
  }

  function normalizeText(value) {
    if (typeof value !== 'string') {
      return '';
    }
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9ąćęłńóśżźüäö\s]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function findExactFaq(question) {
    var normalizedQ = normalizeText(question);
    var dataset = []
      .concat(Array.isArray(state.faqMap.pl) ? state.faqMap.pl : [])
      .concat(Array.isArray(state.faqMap.en) ? state.faqMap.en : []);
    for (var i = 0; i < dataset.length; i++) {
      var entry = dataset[i];
      if (!entry) {
        continue;
      }
      if (normalizeText(entry.q) === normalizedQ) {
        return entry;
      }
      if (Array.isArray(entry.aliases)) {
        for (var j = 0; j < entry.aliases.length; j++) {
          if (normalizeText(entry.aliases[j]) === normalizedQ) {
            return entry;
          }
        }
      }
    }
    return null;
  }

  function scrollMessages() {
    var list = root.querySelector('[data-ownerbot-messages]');
    if (list) {
      requestAnimationFrame(function () {
        list.scrollTop = list.scrollHeight;
      });
    }
  }

  function focusInput() {
    var textarea = root.querySelector('textarea');
    if (textarea) {
      textarea.focus();
    }
  }

  function fileToDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(reader.result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function trapFocus(panel) {
    var focusable = panel.querySelectorAll('button, textarea');
    if (!focusable.length) {
      return;
    }
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    panel.addEventListener('keydown', function (event) {
      if (event.key !== 'Tab') {
        return;
      }
      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
        return;
      }
      if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  function copy() {
    if (state.locale === 'pl') {
      return {
        intro: 'Czesc! Jestem QuantumBot. Odpowiadam na najczestsze pytania o sklep i zamowienia.',
        fallback: 'Nie znalazlem jednoznacznej odpowiedzi. Napisz prosze przez formularz kontaktowy albo podaj e-mail - odezwiemy sie.',
        placeholders: { ask: 'Zadaj pytanie' },
        labels: {
          open: 'Porozmawiajmy',
          close: 'Zamknij',
          send: 'SEND',
          wait: 'Wysylam...',
          attach: 'Załącz obraz',
          removeAttachment: 'Usuń',
          imagePlaceholder: 'Wysłano obraz',
        },
        sources: { faq: 'FAQ', info: 'INFO', ai: 'AI' },
        status: {
          trialBadge: function (days) {
            return 'Trial: ' + days + ' ' + (days === 1 ? 'dzien' : 'dni') + ' do konca';
          },
          expiredBadge: 'Trial zakonczyl sie - aktywuj w panelu aplikacji.',
        },
        thinking: 'Sprawdzam odpowiedz...',
      };
    }

    return {
      intro: 'Hi! I am QuantumBot. I cover the most common store and order questions.',
      fallback: 'I did not find a clear answer. Please leave a message through the contact form or share your email - we will reply soon.',
      placeholders: { ask: 'Ask your question' },
        labels: {
          open: 'Need help?',
          close: 'Close',
          send: 'SEND',
          wait: 'Sending...',
          attach: 'Attach image',
          removeAttachment: 'Remove',
          imagePlaceholder: 'Image attached',
        },
      sources: { faq: 'FAQ', info: 'INFO', ai: 'AI' },
      status: {
        trialBadge: function (days) {
          return 'Trial: ' + days + ' ' + (days === 1 ? 'day' : 'days') + ' remaining';
        },
        expiredBadge: 'Trial ended - activate in the app admin.',
      },
      thinking: 'Let me check that for you...',
    };
  }

  function changeLocale(nextLocale) {
    if (nextLocale !== 'pl' && nextLocale !== 'en') {
      return;
    }
    if (state.locale === nextLocale) {
      return;
    }
    state.locale = nextLocale;
    createFuseIfPossible();
    if (state.messages.length) {
      var first = state.messages[0];
      if (first && first.role === 'bot' && first.source === 'info') {
        first.content = copy().intro;
      }
    }
    render();
  }

  function renderStatusBadge() {
    var status = copy().status;
    var base = document.createElement('div');
    base.style.padding = '10px 16px';
    base.style.borderRadius = '999px';
    base.style.fontSize = '12px';
    base.style.fontWeight = '600';
    base.style.marginBottom = '12px';
    base.style.alignSelf = 'flex-end';

    if (state.billing.state === 'expired') {
      base.style.background = 'rgba(220, 38, 38, 0.12)';
      base.style.color = '#991b1b';
      base.textContent = status.expiredBadge;
      return base;
    }

    if (state.billing.state === 'trial' && typeof state.billing.remainingDays === 'number') {
      base.style.background = 'rgba(59, 130, 246, 0.15)';
      base.style.color = '#1d4ed8';
      base.textContent = status.trialBadge(Math.max(0, state.billing.remainingDays));
      return base;
    }

    return null;
  }

  function render() {
    root.innerHTML = '';
    var container = document.createElement('div');
    container.setAttribute('data-ownerbot-container', 'true');
    container.style.position = 'fixed';
    container.style.zIndex = '2147483000';
    container.style.left = 'auto';
    container.style.right = '18px';
    container.style.bottom = '18px';

    var statusBadge = renderStatusBadge();
    if (statusBadge) {
      container.appendChild(statusBadge);
      if (state.billing.state === 'expired') {
        root.appendChild(container);
        return;
      }
    }

    var button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', state.open ? copy().labels.close : copy().labels.open);
    button.style.height = '74px';
    button.style.width = '74px';
    button.style.borderRadius = '28px';
    button.style.background = '#ffffff';
    button.style.border = '1px solid rgba(15, 23, 42, 0.12)';
    button.style.color = '#0f172a';
    button.style.overflow = 'hidden';
    button.style.display = 'flex';
    button.style.alignItems = 'center';
    button.style.justifyContent = 'center';
    button.style.boxShadow = state.open
      ? '0 20px 36px rgba(15, 23, 42, 0.18)'
      : '0 28px 56px rgba(15, 23, 42, 0.4)';
    button.style.cursor = 'pointer';
    button.style.transition = 'transform 0.2s ease, box-shadow 0.2s ease';
    button.addEventListener('mouseenter', function () {
      button.style.transform = 'scale(1.06)';
      button.style.boxShadow = state.open
        ? '0 24px 44px rgba(15, 23, 42, 0.22)'
        : '0 34px 70px rgba(15, 23, 42, 0.48)';
    });
    button.addEventListener('mouseleave', function () {
      button.style.transform = 'scale(1)';
      button.style.boxShadow = state.open
        ? '0 20px 36px rgba(15, 23, 42, 0.18)'
        : '0 28px 56px rgba(15, 23, 42, 0.4)';
    });
    button.addEventListener('click', function () {
      state.open = !state.open;
      if (state.open) {
        state.lastFocused = document.activeElement;
      }
      render();
      if (state.open) {
        setTimeout(focusInput, 10);
      } else if (state.lastFocused) {
        state.lastFocused.focus();
      }
    });

    if (state.open) {
      button.textContent = '\u00D7';
      button.style.fontSize = '28px';
      button.style.fontWeight = '600';
      button.style.lineHeight = '1';
    } else {
      var icon = createLogoBadge(34, { background: '#ffffff', border: true, shadow: false });
      icon.style.width = '34px';
      icon.style.height = '34px';
      button.appendChild(icon);
    }

    container.appendChild(button);

    if (state.open) {
      var panel = document.createElement('section');
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      panel.setAttribute('aria-label', 'QuantumBot');
      panel.style.width = 'min(520px, calc(100vw - 32px))';
      panel.style.maxHeight = 'min(620px, calc(100vh - 160px))';
      panel.style.background = '#ffffff';
      panel.style.borderRadius = '28px';
      panel.style.boxShadow = '0 36px 68px rgba(8, 8, 11, 0.32)';
      panel.style.display = 'flex';
      panel.style.flexDirection = 'column';
      panel.style.overflow = 'hidden';
      panel.style.marginBottom = '18px';

      var header = document.createElement('header');
      header.style.display = 'flex';
      header.style.alignItems = 'center';
      header.style.justifyContent = 'space-between';
      header.style.padding = '18px 24px';
      header.style.background = '#ffffff';
      header.style.borderBottom = '1px solid rgba(17, 24, 39, 0.06)';
      header.style.color = '#0f172a';

      var title = document.createElement('div');
      title.style.display = 'flex';
      title.style.alignItems = 'center';
      title.style.gap = '12px';

      var bubble = createLogoBadge(70, { radius: '22px' });

      var heading = document.createElement('div');
      var name = document.createElement('strong');
      name.textContent = 'QuantumBot';
      name.style.fontSize = '18px';
      name.style.fontWeight = '600';
      name.style.color = '#0f172a';
      var tagline = document.createElement('span');
      tagline.textContent = 'Quantum Assist';
      tagline.style.display = 'block';
      tagline.style.fontSize = '12px';
      tagline.style.color = 'rgba(15, 23, 42, 0.65)';
      heading.appendChild(name);
      heading.appendChild(tagline);

      title.appendChild(bubble);
      title.appendChild(heading);

      var controls = document.createElement('div');
      controls.style.display = 'flex';
      controls.style.alignItems = 'center';
      controls.style.gap = '12px';

      var localeSwitch = document.createElement('div');
      localeSwitch.style.display = 'flex';
      localeSwitch.style.alignItems = 'center';
      localeSwitch.style.gap = '6px';
      localeSwitch.style.fontSize = '13px';
      localeSwitch.style.fontWeight = '600';
      localeSwitch.style.color = '#0f172a';

      ['pl', 'en'].forEach(function (lang, index) {
        var switchBtn = document.createElement('button');
        switchBtn.type = 'button';
        switchBtn.textContent = lang.toUpperCase();
        switchBtn.style.border = 'none';
        switchBtn.style.background = 'transparent';
        switchBtn.style.padding = '0';
        switchBtn.style.cursor = state.locale === lang ? 'default' : 'pointer';
        switchBtn.style.color = state.locale === lang ? '#0f172a' : 'rgba(15, 23, 42, 0.45)';
        switchBtn.style.opacity = state.locale === lang ? '1' : '0.7';
        switchBtn.disabled = state.locale === lang;
        switchBtn.addEventListener('click', function () {
          changeLocale(lang);
        });
        localeSwitch.appendChild(switchBtn);
        if (index === 0) {
          var divider = document.createElement('span');
          divider.textContent = '/';
          divider.style.opacity = '0.45';
          localeSwitch.appendChild(divider);
        }
      });

      controls.appendChild(localeSwitch);

      if (wooKeys) {
        var wooBadge = document.createElement('span');
        wooBadge.textContent = state.locale === 'pl' ? 'Woo dane' : 'Woo data';
        wooBadge.style.background = 'rgba(79, 70, 229, 0.1)';
        wooBadge.style.color = '#4338ca';
        wooBadge.style.padding = '4px 10px';
        wooBadge.style.borderRadius = '999px';
        wooBadge.style.fontSize = '11px';
        wooBadge.style.fontWeight = '600';
        controls.appendChild(wooBadge);
      }

      var closeButton = document.createElement('button');
      closeButton.type = 'button';
      closeButton.textContent = '\u00D7';
      closeButton.setAttribute('aria-label', copy().labels.close);
      closeButton.style.background = 'transparent';
      closeButton.style.border = 'none';
      closeButton.style.color = '#0f172a';
      closeButton.style.fontSize = '28px';
      closeButton.style.lineHeight = '1';
      closeButton.style.cursor = 'pointer';
      closeButton.addEventListener('click', function () {
        state.open = false;
        render();
      });
      controls.appendChild(closeButton);

      header.appendChild(title);
      header.appendChild(controls);
      panel.appendChild(header);

      var list = document.createElement('div');
      list.setAttribute('data-ownerbot-messages', 'true');
      list.style.flex = '1';
      list.style.padding = '22px 26px';
      list.style.display = 'flex';
      list.style.flexDirection = 'column';
      list.style.gap = '16px';
      list.style.overflowY = 'auto';
      list.style.background = '#f7f8fc';

      state.messages.forEach(function (message) {
        var row = document.createElement('div');
        var isUser = message.role === 'user';
        row.style.display = 'flex';
        row.style.gap = '12px';
        row.style.justifyContent = isUser ? 'flex-end' : 'flex-start';
        row.style.alignItems = 'flex-start';

        if (!isUser) {
          var avatar = createLogoBadge(54, { radius: '18px', background: '#ffffff' });
          avatar.style.minWidth = '54px';
          avatar.style.border = '1px solid rgba(15, 23, 42, 0.08)';
          row.appendChild(avatar);
        }

        var bubbleMsg = document.createElement('div');
        bubbleMsg.style.maxWidth = '84%';
        bubbleMsg.style.padding = '12px 16px';
        bubbleMsg.style.borderRadius = '18px';
        bubbleMsg.style.fontSize = '14px';
        bubbleMsg.style.lineHeight = '1.5';
        bubbleMsg.style.whiteSpace = 'pre-wrap';
        bubbleMsg.style.background = isUser ? '#111827' : '#ffffff';
        bubbleMsg.style.color = isUser ? '#ffffff' : '#111827';
        bubbleMsg.style.boxShadow = isUser ? '0 10px 20px rgba(17, 24, 39, 0.18)' : '0 4px 10px rgba(15, 23, 42, 0.08)';
        bubbleMsg.style.border = '1px solid rgba(15, 23, 42, 0.05)';

        if (!isUser && message.source) {
          var badge = document.createElement('span');
          badge.textContent = copy().sources[message.source] || message.source.toUpperCase();
          badge.style.display = 'inline-block';
          badge.style.fontSize = '11px';
          badge.style.fontWeight = '600';
          badge.style.letterSpacing = '0.08em';
          badge.style.marginBottom = '6px';
          badge.style.color = '#6b7280';
          badge.style.textTransform = 'uppercase';
          bubbleMsg.appendChild(badge);
          bubbleMsg.appendChild(document.createElement('br'));
        }

        if (message.content) {
          bubbleMsg.appendChild(document.createTextNode(message.content));
        }

        if (message.attachment && message.attachment.dataUrl) {
          if (message.content) {
            bubbleMsg.appendChild(document.createElement('br'));
            bubbleMsg.appendChild(document.createElement('br'));
          }
          var attachmentWrapper = document.createElement('div');
          attachmentWrapper.style.marginTop = '6px';
          attachmentWrapper.style.border = '1px solid rgba(15, 23, 42, 0.08)';
          attachmentWrapper.style.borderRadius = '12px';
          attachmentWrapper.style.overflow = 'hidden';
          attachmentWrapper.style.background = isUser ? 'rgba(255,255,255,0.1)' : '#f8fafc';

          var attachmentImg = document.createElement('img');
          attachmentImg.src = message.attachment.dataUrl;
          attachmentImg.alt = message.attachment.name || 'Attachment';
          attachmentImg.style.width = '180px';
          attachmentImg.style.height = '180px';
          attachmentImg.style.objectFit = 'cover';
          attachmentWrapper.appendChild(attachmentImg);

          if (message.attachment.name) {
            var attachmentLabel = document.createElement('p');
            attachmentLabel.textContent = message.attachment.name;
            attachmentLabel.style.fontSize = '12px';
            attachmentLabel.style.margin = '6px 10px 10px';
            attachmentLabel.style.color = isUser ? 'rgba(255,255,255,0.8)' : '#475569';
            attachmentWrapper.appendChild(attachmentLabel);
          }

          bubbleMsg.appendChild(attachmentWrapper);
        }
        row.appendChild(bubbleMsg);
        list.appendChild(row);
      });

      panel.appendChild(list);

      var form = document.createElement('form');
      form.style.padding = '16px 20px';
      form.style.display = 'flex';
      form.style.flexDirection = 'column';
      form.style.gap = '12px';
      form.style.borderTop = '1px solid #e2e8f0';
      form.style.background = '#ffffff';
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        if (state.sending) {
          return;
        }
        var textarea = form.querySelector('textarea');
        var question = textarea ? textarea.value.trim() : '';
        if (!question && !state.pendingAttachment) {
          return;
        }
        if (textarea) {
          textarea.value = '';
        }
        handleMessage(question);
      });

      var attachmentBar = document.createElement('div');
      attachmentBar.style.display = 'flex';
      attachmentBar.style.alignItems = 'center';
      attachmentBar.style.gap = '12px';

      var attachButton = document.createElement('button');
      attachButton.type = 'button';
      attachButton.textContent = copy().labels.attach;
      attachButton.style.fontSize = '12px';
      attachButton.style.fontWeight = '600';
      attachButton.style.letterSpacing = '0.1em';
      attachButton.style.padding = '8px 14px';
      attachButton.style.borderRadius = '999px';
      attachButton.style.border = '1px dashed #cbd5f5';
      attachButton.style.background = '#f8fafc';
      attachButton.style.cursor = 'pointer';
      attachButton.addEventListener('click', function () {
        var picker = form.querySelector('input[type="file"]');
        if (picker) {
          picker.click();
        }
      });
      attachmentBar.appendChild(attachButton);

      var attachmentInfo = document.createElement('div');
      attachmentInfo.style.flex = '1';
      attachmentInfo.style.fontSize = '12px';
      attachmentInfo.style.color = '#475569';
      if (state.pendingAttachment) {
        var infoText = document.createElement('span');
        infoText.textContent = state.pendingAttachment.name + ' (' + Math.round(state.pendingAttachment.size / 1024) + ' KB)';
        attachmentInfo.appendChild(infoText);

        var removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.textContent = copy().labels.removeAttachment;
        removeButton.style.marginLeft = '8px';
        removeButton.style.fontSize = '11px';
        removeButton.style.textTransform = 'uppercase';
        removeButton.style.letterSpacing = '0.1em';
        removeButton.style.color = '#dc2626';
        removeButton.style.background = 'transparent';
        removeButton.style.border = 'none';
        removeButton.style.cursor = 'pointer';
        removeButton.addEventListener('click', function () {
          state.pendingAttachment = null;
          render();
        });
        attachmentInfo.appendChild(removeButton);
      } else {
        attachmentInfo.textContent = '';
      }
      attachmentBar.appendChild(attachmentInfo);

      var fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.style.display = 'none';
      fileInput.addEventListener('change', function (event) {
        var file = event.target.files && event.target.files[0];
        if (!file) {
          return;
        }
        fileToDataUrl(file)
          .then(function (dataUrl) {
            state.pendingAttachment = {
              name: file.name,
              type: file.type,
              size: file.size,
              dataUrl: dataUrl,
            };
            render();
          })
          .catch(function (error) {
            console.error('[OwnerBot] Attachment failed', error);
          })
          .finally(function () {
            event.target.value = '';
          });
      });
      attachmentBar.appendChild(fileInput);
      form.appendChild(attachmentBar);

      var inputRow = document.createElement('div');
      inputRow.style.display = 'flex';
      inputRow.style.gap = '12px';

      var textarea = document.createElement('textarea');
      textarea.rows = state.open ? 2 : 1;
      textarea.placeholder = copy().placeholders.ask;
      textarea.disabled = state.sending;
      textarea.style.flex = '1';
      textarea.style.resize = 'none';
      textarea.style.fontFamily = 'inherit';
      textarea.style.fontSize = '14px';
      textarea.style.padding = '10px 12px';
      textarea.style.borderRadius = '12px';
      textarea.style.border = '1px solid #e2e8f0';
      textarea.style.outline = 'none';
      textarea.style.cursor = state.sending ? 'not-allowed' : 'text';
      textarea.style.background = '#ffffff';
      textarea.style.color = '#111827';
      textarea.style.caretColor = '#111827';
      textarea.addEventListener('keydown', function (event) {
        if (state.sending) {
          return;
        }
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          form.dispatchEvent(new Event('submit', { cancelable: true }));
        }
      });
      inputRow.appendChild(textarea);

      var submit = document.createElement('button');
      submit.type = 'submit';
      submit.textContent = state.sending ? copy().labels.wait : copy().labels.send;
      submit.disabled = state.sending;
      submit.style.background = '#111827';
      submit.style.color = '#ffffff';
      submit.style.border = 'none';
      submit.style.borderRadius = '12px';
      submit.style.padding = '10px 18px';
      submit.style.cursor = state.sending ? 'wait' : 'pointer';
      submit.style.opacity = state.sending ? '0.7' : '1';
      inputRow.appendChild(submit);

      form.appendChild(inputRow);
      panel.appendChild(form);

      trapFocus(panel);
      container.appendChild(panel);
    }

    root.appendChild(container);
  }
})();
