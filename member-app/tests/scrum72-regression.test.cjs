/* global __dirname */
// Run: node --test tests/scrum72-regression.test.cjs
// Requires react-test-renderer matching React 19.2.3 (may be provided via TEST_TOOLS).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const ts = require('typescript');
const testRequire = process.env.TEST_TOOLS
  ? createRequire(path.join(process.env.TEST_TOOLS, 'package.json')) : require;
const React = testRequire('react');
const { create, act } = testRequire('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const app = process.env.SCRUM72_SOURCE_ROOT || path.resolve(__dirname, '../src/app');
const fixture = { id: 7, class_name: 'Yoga', instructor_name: 'Instructor',
  schedule_date: '2099-01-01', start_time: '10:00', end_time: '11:00',
  status: 'scheduled', participants_count: 3, min_participants: 5 };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function load(file, deps, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, require: (name) => {
      if (Object.hasOwn(deps, name)) return deps[name];
      throw new Error(`Unexpected import ${name}`);
    }, AbortController, console, setInterval, clearInterval, setTimeout, clearTimeout, ...globals,
  }, { filename: file });
  return module.exports;
}
function setup({ restoring = false, payload = false, getDetail, authToken, membership, bookings = [], now, view = "detail", listLifecycle = false } = {}) {
  let auth = { isLoading: restoring, userToken: restoring ? null : 'test-session' };
  if (authToken !== undefined) auth.userToken = authToken;
  // Simulate a restored credential for the pre-POST storage race cases.
  let readToken = async () => auth.userToken ?? (authToken === null ? 'stored-test-session' : null);
  let route = { id: '7', ...(payload ? { scheduleData: JSON.stringify(fixture) } : {}) };
  let focused = true;
  let time = now ?? Date.now();
  let nextTimer = 0;
  const timers = new Map();
  const listeners = new Set();
  const setTimer = (callback, delay, repeat) => {
    const id = ++nextTimer;
    timers.set(id, { callback, delay, repeat, at: time + delay });
    return id;
  };
  const clearTimer = (id) => timers.delete(id);
  const advance = async (delay) => {
    const until = time + delay;
    while (true) {
      const due = [...timers.entries()].filter(([, timer]) => timer.at <= until)
        .sort(([, a], [, b]) => a.at - b.at)[0];
      if (!due) break;
      const [id, timer] = due;
      time = timer.at;
      if (timer.repeat) timer.at += timer.delay;
      else timers.delete(id);
      await act(async () => { timer.callback(); });
    }
    time = until;
  };
  const detailCalls = [], postCalls = [], getCalls = [], statusCalls = [], navigation = [];
  let overrideGet = () => undefined;
  let post = () => Promise.resolve({ data: { data: { schedule: { participants_count: 4 } } } });
  const api = { get: (url, options) => {
    if (url === '/api/v1/class-schedules/status') statusCalls.push(options);
    else getCalls.push(url);
    const override = overrideGet(url, options);
    if (override !== undefined) return override;
    if (url === '/api/v1/class-schedules/status') return Promise.resolve({ status: 304 });
    if (url === '/api/v1/class-schedules') {
      const request = deferred(); detailCalls.push({ ...request, options });
      return getDetail ? getDetail(request) : request.promise;
    }
    if (url === '/api/v1/me') return Promise.resolve({ data: { data: { membership: membership === undefined ? {
      is_active: true, status: 'active', start_date: '2098-01-01', end_date: '2100-01-01',
    } : membership } } });
    if (url === '/api/v1/member/bookings') return Promise.resolve({ data: { data: bookings } });
    throw new Error(url);
  }, post: (...args) => { postCalls.push(args); return post(); } };
  const deps = {
    react: React, 'react-native': Object.fromEntries(
      ['View','Text','TouchableOpacity','Modal','ActivityIndicator','ScrollView','SectionList','RefreshControl']
        .map((x) => [x, x])),
    'expo-router': { useLocalSearchParams: () => route,
      useRouter: () => ({ push: (value) => navigation.push(value) }),
      useFocusEffect: (effect) => React.useEffect(
        () => focused && (view === 'detail' || listLifecycle) ? effect() : undefined, [effect, focused]) },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '@/lib/api': api, '@/lib/auth': { getToken: () => readToken() },
    '@/context/AuthContext': { useAuth: () => auth }, '@/mocks/schedules': { MOCK_SCHEDULES: [] },
    '@/components/ParticipantCounter': { ParticipantCounter: 'Counter' },
    '@/components/StatusBadge': { StatusBadge: 'Badge' },
  };
  // Render actual list cards instead of leaving renderItem inside a native host.
  const appState = { currentState: 'active', addEventListener: (_event, listener) => {
    listeners.add(listener);
    return { remove: () => listeners.delete(listener) };
  } };
  deps['react-native'].AppState = appState;
  deps['react-native'].SectionList = function ListHost({ sections, renderItem, refreshControl, ...props }) {
    return React.createElement('SectionList', { ...props, onRefresh: refreshControl.props.onRefresh },
      ...sections.flatMap((section) => section.data.map((item) =>
        React.createElement(React.Fragment, { key: item.id }, renderItem({ item })))));
  };
  const openedChatLinks = [];
  const ChatAdminButton = load(path.resolve(app, '../components/ChatAdminButton.tsx'), {
    ...deps,
    'expo-linking': {
      canOpenURL: async () => true,
      openURL: async (url) => { openedChatLinks.push(url); },
    },
    '../lib/whatsapp': { buildWaLink: () => 'https://example.test/qa-chat' },
  }).ChatAdminButton;
  deps['@/components/ChatAdminButton'] = { ChatAdminButton };
  class ClockDate extends Date { static now() { return time; } }
  const timerGlobals = {
    Date: ClockDate, setInterval: (fn, delay) => setTimer(fn, delay, true),
    setTimeout: (fn, delay) => setTimer(fn, delay, false),
    clearInterval: clearTimer, clearTimeout: clearTimer,
  };
  const schedules = load(path.join(app, '(app)/schedules.tsx'), deps, timerGlobals);
  deps['@/app/(app)/schedules'] = schedules;
  const Counter = load(path.resolve(app, '../components/ParticipantCounter.tsx'), deps).ParticipantCounter;
  const Badge = load(path.resolve(app, '../components/StatusBadge.tsx'), deps).StatusBadge;
  deps['@/components/ParticipantCounter'] = { ParticipantCounter: Counter };
  deps['@/components/StatusBadge'] = { StatusBadge: Badge };
  const Screen = load(path.join(app, 'schedule/[id].tsx'), deps, timerGlobals).default;
  const Component = view === 'list' ? schedules.default : Screen;
  let root;
  return {
    detailCalls, postCalls, getCalls, statusCalls, schedules, navigation, advance,
    activeTimers: () => [...timers.values()].map((timer) => timer.delay),
    listenerCount: () => listeners.size,
    refreshProps: () => root.root.findByType('ScrollView').props.refreshControl.props,
    appState: (next) => act(async () => {
      appState.currentState = next;
      for (const listener of listeners) listener(next);
    }),
    focus: (value) => act(async () => {
      focused = value;
      root.update(React.createElement(Component));
    }),
    route: (item) => act(async () => {
      route = { id: String(item.id), scheduleData: JSON.stringify(item) };
      root.update(React.createElement(Component));
    }),
    openedChatLinks,
    chatProps: () => root.root.findByType(ChatAdminButton).props,
    chatHasNavigationAncestor: () => {
      let parent = root.root.findByType(ChatAdminButton).parent;
      while (parent) {
        if (parent.type === 'TouchableOpacity') return true;
        parent = parent.parent;
      }
      return false;
    },
    refreshList: async () => { await act(async () => root.root.findByType('SectionList').props.onRefresh()); },
    setGet: (fn) => { overrideGet = fn; },
    counterProps: () => root.root.findByType(Counter).props,
    badgeProps: () => root.root.findByType(Badge).props,
    setTokenReader: (fn) => { readToken = fn; },
    setPost: (fn) => { post = fn; },
    mount: async () => { await act(async () => { root = create(React.createElement(Component)); }); },
    auth: async (value) => { auth = value; await act(async () => root.update(React.createElement(Component))); },
    text: () => JSON.stringify(root.toJSON(), (key, value) => key === "refreshControl" ? undefined : value),
    buttonProps: (label) => root.root.findAllByType('TouchableOpacity').find((n) =>
      n.findAllByType('Text').some((t) => t.children.join('') === label)).props,
    button: (label) => root.root.findAllByType('TouchableOpacity').find((n) =>
      n.findAllByType('Text').some((t) => t.children.join('') === label)).props.onPress,
    unmount: async () => { await act(async () => root.unmount()); },
  };
}
const response = (name) => ({ data: { data: [{ ...fixture, class_name: name }] } });
test('restoration waits, loads once when ready, no retry loop', async () => {
  const h = setup({ restoring: true }); await h.mount();
  assert.equal(h.detailCalls.length, 0);
  await h.auth({ isLoading: false, userToken: 'restored-session' });
  assert.equal(h.detailCalls.length, 1);
  await act(async () => h.detailCalls[0].resolve(response('Restored')));
  assert.match(h.text(), /Restored/); assert.equal(h.detailCalls.length, 1);
  await h.unmount();
});
test('token change restarts fallback; old rejection/finally cannot stop new loading', async () => {
  const h = setup(); await h.mount(); const old = h.detailCalls[0];
  await h.auth({ isLoading: false, userToken: 'replacement-session' });
  assert.equal(h.detailCalls.length, 2); assert.equal(old.options.signal.aborted, true);
  await act(async () => old.reject(new Error('old error')));
  assert.match(h.text(), /Memuat detail/); assert.doesNotMatch(h.text(), /old error/);
  await act(async () => h.detailCalls[1].resolve(response('Latest')));
  assert.match(h.text(), /Latest/); await h.unmount();
});
test('out-of-order success cannot replace newer session result', async () => {
  const h = setup(); await h.mount();
  await h.auth({ isLoading: false, userToken: 'replacement-session' });
  assert.equal(h.detailCalls.length, 2);
  await act(async () => h.detailCalls[1].resolve(response('Latest')));
  await act(async () => h.detailCalls[0].resolve(response('Obsolete')));
  assert.match(h.text(), /Latest/); assert.doesNotMatch(h.text(), /Obsolete/); await h.unmount();
});
test('same-ID retries protect loading from older finally and error', async () => {
  const h = setup(); await h.mount();
  await act(async () => h.detailCalls[0].reject(new Error('offline')));
  const retry = h.button('Coba Lagi');
  await act(async () => { void retry(); void retry(); });
  assert.equal(h.detailCalls.length, 3);
  // Two rapid retry calls start two idempotent GETs; the first is canceled.
  assert.equal(h.detailCalls[1].options.signal.aborted, true);
  assert.equal(h.detailCalls[2].options.signal.aborted, false);
  await act(async () => h.detailCalls[1].resolve(response('Obsolete')));
  assert.match(h.text(), /Memuat detail/);
  await act(async () => h.detailCalls[2].resolve(response('Retry latest')));
  assert.match(h.text(), /Retry latest/); await h.unmount();
});
test('status missing, null, wrong type, empty and unknown never become scheduled', () => {
  const h = setup();
  for (const status of [undefined, null, 12, {}, [], '', ' ', 'unexpected']) {
    const item = h.schedules.normalizeScheduleItem({ ...fixture, status });
    assert.equal(item.status, 'unknown');
    assert.equal(h.schedules.normalizeScheduleItem(item).status, 'unknown');
  }
  for (const status of ['scheduled', 'ongoing', 'completed', 'cancelled']) {
    assert.equal(h.schedules.normalizeScheduleItem({ ...fixture, status }).status, status);
  }
});
test('unknown status disables booking in actual detail component', async () => {
  const h = setup(); await h.mount();
  await act(async () => h.detailCalls[0].resolve({ data: { data: [{ ...fixture, status: null }] } }));
  assert.match(h.text(), /Sesi tidak dalam status terjadwal/); await h.unmount();
});
test('TC-409-06: two confirmation calls before render send one POST; failure unlocks retry', async () => {
  const h = setup({ payload: true }); const first = deferred();
  h.setPost(() => first.promise); await h.mount();
  await act(async () => h.button('Booking Kelas')());
  const confirm = h.button('Ya, Booking');
  await act(async () => { void confirm(); void confirm(); });
  assert.equal(h.postCalls.length, 1);
  await act(async () => first.reject(new Error('offline')));
  assert.match(h.text(), /Gagal Booking/);
  h.setPost(() => Promise.resolve({ data: { data: { schedule: { participants_count: 4 } } } }));
  await act(async () => h.button('Booking Kelas')());
  await act(async () => h.button('Ya, Booking')());
  assert.equal(h.postCalls.length, 2); assert.match(h.text(), /Sudah Terdaftar/);
  await h.unmount();
});

for (const outcome of ['resolve', 'reject']) {
  test(`unmount aborts pending fallback; late ${outcome} starts no follow-up request`, async () => {
    const h = setup(); await h.mount(); const pending = h.detailCalls[0];
    await h.unmount();
    assert.equal(pending.options.signal.aborted, true);
    await act(async () => {
      if (outcome === 'resolve') pending.resolve(response('Unmounted'));
      else pending.reject(new Error('late failure'));
    });
    assert.deepEqual(h.getCalls, ['/api/v1/class-schedules']);
    assert.equal(h.postCalls.length, 0);
  });
}

test('auth changes during pre-POST token read: no old POST, new context can verify and book', async () => {
  const h = setup({ payload: true, authToken: null }); await h.mount();
  const pendingToken = deferred(); h.setTokenReader(() => pendingToken.promise);
  await act(async () => h.button('Booking Kelas')());
  let confirmation;
  await act(async () => { confirmation = h.button('Ya, Booking')(); });
  assert.equal(h.postCalls.length, 0);
  await h.auth({ isLoading: false, userToken: 'new-account-session' });
  await act(async () => pendingToken.resolve('old-account-session'));
  await act(async () => confirmation);
  assert.equal(h.postCalls.length, 0);
  assert.equal(h.buttonProps('Booking Kelas').disabled, false);
  await act(async () => h.button('Booking Kelas')());
  await act(async () => h.button('Ya, Booking')());
  assert.equal(h.postCalls.length, 1);
  assert.equal(h.postCalls[0][2].headers.Authorization, 'Bearer new-account-session');
  assert.match(h.text(), /Sudah Terdaftar/); await h.unmount();
});

for (const status of [undefined, null, 12, {}, [], '', ' ', 'unexpected']) {
  test(`invalid status ${JSON.stringify(status)} blocks POST even if handlers are invoked`, async () => {
    const h = setup(); await h.mount();
    await act(async () => h.detailCalls[0].resolve({ data: { data: [{ ...fixture, status }] } }));
    assert.equal(h.buttonProps('Booking Kelas').disabled, true);
    // Deliberately bypass the native disabled prop to exercise handler guards too.
    await act(async () => h.button('Booking Kelas')());
    await act(async () => h.button('Ya, Booking')());
    assert.equal(h.postCalls.length, 0);
    assert.match(h.text(), /Sesi tidak dalam status terjadwal/); await h.unmount();
  });
}

test('old pre-POST completion cannot unlock a newer account submission', async () => {
  const h = setup({ payload: true, authToken: null }); await h.mount();
  const oldToken = deferred(); h.setTokenReader(() => oldToken.promise);
  await act(async () => h.button('Booking Kelas')());
  let oldConfirmation;
  await act(async () => { oldConfirmation = h.button('Ya, Booking')(); });
  await h.auth({ isLoading: false, userToken: 'new-account-session' });
  const newPost = deferred(); h.setPost(() => newPost.promise);
  await act(async () => h.button('Booking Kelas')());
  const newConfirm = h.button('Ya, Booking');
  await act(async () => { void newConfirm(); });
  assert.equal(h.postCalls.length, 1);
  await act(async () => oldToken.resolve('old-account-session'));
  await act(async () => oldConfirmation);
  await act(async () => { void newConfirm(); });
  assert.equal(h.postCalls.length, 1);
  await act(async () => newPost.resolve({ data: { data: { schedule: { participants_count: 4 } } } }));
  assert.match(h.text(), /Sudah Terdaftar/); await h.unmount();
});

test('Jira detail renders required info with actual counter and badge', async () => {
  const h = setup({ payload: true }); await h.mount();
  assert.match(h.text(), /Yoga/); assert.match(h.text(), /Instructor/);
  assert.match(h.text(), /2099/); assert.match(h.text(), /10:00/); assert.match(h.text(), /WITA/);
  assert.equal(h.counterProps().current, 3); assert.equal(h.counterProps().min, 5);
  assert.equal(h.badgeProps().status, 'scheduled'); await h.unmount();
});

for (const [label, membership, eligible] of [
  ['active inside period', { is_active: true, status: 'active', start_date: '2098-01-01', end_date: '2100-01-01' }, true],
  ['first day inclusive', { is_active: true, status: 'active', start_date: '2099-01-01', end_date: '2099-01-31' }, true],
  ['last day inclusive', { is_active: true, status: 'active', start_date: '2098-12-01', end_date: '2099-01-01' }, true],
  ['upcoming covers session', { is_active: false, status: 'upcoming', start_date: '2099-01-01', end_date: '2099-01-31' }, true],
  ['not started on session date', { is_active: false, status: 'upcoming', start_date: '2099-01-02', end_date: '2099-02-01' }, false],
  ['ends before session', { is_active: true, status: 'active', start_date: '2098-01-01', end_date: '2098-12-31' }, false],
  ['pending', { is_active: false, status: 'pending', start_date: null, end_date: null }, false],
  ['expired', { is_active: false, status: 'expired', start_date: '2098-01-01', end_date: '2098-12-31' }, false],
  ['none', { is_active: false, status: 'none', start_date: null, end_date: null }, false],
]) {
  test(`B6 ${label}`, async () => {
    const h = setup({ payload: true, membership }); await h.mount();
    assert.equal(h.buttonProps('Booking Kelas').disabled, !eligible);
    if (!eligible) {
      await act(async () => h.button('Ya, Booking')()); assert.equal(h.postCalls.length, 0);
    }
    await h.unmount();
  });
}

for (const [status, id, expected] of [['booked', 7, true], ['attended', 7, true], ['cancelled', 7, false], ['booked', 8, false]]) {
  test(`GET bookings ${status} schedule ${id}`, async () => {
    const h = setup({ payload: true, bookings: [{ id: 2, status, schedule: { id, participants_count: 3 } }] });
    await h.mount(); assert.ok(h.getCalls.includes('/api/v1/member/bookings'));
    assert.equal(h.buttonProps(expected ? 'Sudah Terdaftar' : 'Booking Kelas').disabled, expected);
    if (expected) { await act(async () => h.button('Ya, Booking')()); assert.equal(h.postCalls.length, 0); }
    await h.unmount();
  });
}

for (const [label, now] of [['before start', '2099-01-01T09:59:59+08:00'], ['exact start', '2099-01-01T10:00:00+08:00'], ['after start', '2099-01-01T10:01:00+08:00']]) {
  test(`B7 WITA ${label}`, async () => {
    const h = setup({ payload: true, now: Date.parse(now) }); await h.mount();
    assert.equal(h.buttonProps('Booking Kelas').disabled, label !== 'before start');
    if (label !== 'before start') { await act(async () => h.button('Ya, Booking')()); assert.equal(h.postCalls.length, 0); }
    await h.unmount();
  });
}

for (const status of ['ongoing', 'completed', 'cancelled']) {
  test(`B7 ${status} cannot POST`, async () => {
    const h = setup(); await h.mount();
    await act(async () => h.detailCalls[0].resolve({ data: { data: [{ ...fixture, status }] } }));
    await act(async () => h.button('Ya, Booking')()); assert.equal(h.postCalls.length, 0);
    await h.unmount();
  });
}

test('TC-409-04: confirmation before POST, loading, server counter and disabled booked button', async () => {
  const h = setup({ payload: true }); const pending = deferred(); h.setPost(() => pending.promise);
  await h.mount(); assert.equal(h.postCalls.length, 0);
  const initialGetCount = h.getCalls.length;
  await act(async () => h.button('Booking Kelas')()); assert.equal(h.postCalls.length, 0);
  assert.match(h.text(), /Konfirmasi Booking/);
  await act(async () => { void h.button('Ya, Booking')(); });
  assert.equal(h.postCalls.length, 1);
  assert.equal(h.postCalls[0][0], '/api/v1/member/class-schedules/7/booking');
  assert.equal(Object.keys(h.postCalls[0][1]).length, 0);
  assert.equal(h.buttonProps('Batal').disabled, true);
  assert.equal(h.counterProps().current, 3);
  await act(async () => pending.resolve({ data: { data: { schedule: { participants_count: 11 } } } }));
  assert.equal(h.counterProps().current, 11);
  assert.equal(h.buttonProps('Sudah Terdaftar').disabled, true); assert.match(h.text(), /Booking Berhasil/);
  assert.equal(h.getCalls.length, initialGetCount);
  await h.unmount();
});

test('TC-409-05: POST HTTP 422 preserves message/counter and supports retry', async () => {
  const h = setup({ payload: true }); await h.mount();
  const before = h.getCalls.length;
  h.setPost(() => Promise.reject({ response: { status: 422, data: { message: 'Membership tidak aktif pada tanggal sesi.' } } }));
  await act(async () => h.button('Booking Kelas')());
  await act(async () => h.button('Ya, Booking')());
  assert.match(h.text(), /Gagal Booking/);
  assert.match(h.text(), /Membership tidak aktif pada tanggal sesi/);
  assert.equal(h.counterProps().current, 3);
  assert.equal(h.buttonProps('Booking Kelas').disabled, false);
  assert.equal(h.getCalls.length, before);
  h.setPost(() => Promise.resolve({ data: { data: { schedule: { participants_count: 8 } } } }));
  await act(async () => h.button('Booking Kelas')());
  await act(async () => h.button('Ya, Booking')());
  assert.equal(h.postCalls.length, 2); assert.equal(h.counterProps().current, 8);
  assert.equal(h.buttonProps('Sudah Terdaftar').disabled, true);
  await h.unmount();
});

for (const malformed of [false, true]) {
  test(`GET bookings ${malformed ? 'malformed response' : 'HTTP 500'} blocks POST and supports retry`, async () => {
    const h = setup({ payload: true });
    h.setGet((url) => url === '/api/v1/member/bookings'
      ? malformed ? Promise.resolve({ data: { data: {} } }) : Promise.reject({ response: { status: 500 } }) : undefined);
    await h.mount(); assert.match(h.text(), /Gagal|tidak valid/);
    await act(async () => h.button('Ya, Booking')()); assert.equal(h.postCalls.length, 0);
    h.setGet(() => undefined); await act(async () => h.button('Coba Lagi')());
    assert.equal(h.buttonProps('Booking Kelas').disabled, false); await h.unmount();
  });
}

test('pending eligibility verification blocks handlers until both GETs complete', async () => {
  const h = setup({ payload: true }); const pending = deferred();
  h.setGet((url) => url === '/api/v1/me' ? pending.promise : undefined);
  await h.mount(); assert.match(h.text(), /Memverifikasi/);
  await act(async () => h.button('Ya, Booking')()); assert.equal(h.postCalls.length, 0);
  await act(async () => pending.resolve({ data: { data: { membership: {
    is_active: true, status: 'active', start_date: '2098-01-01', end_date: '2100-01-01',
  } } } }));
  assert.equal(h.buttonProps('Booking Kelas').disabled, false); await h.unmount();
});

test('missing membership response remains error, never assumes active', async () => {
  const h = setup({ payload: true, membership: null }); await h.mount();
  assert.match(h.text(), /Format data membership/);
  await act(async () => h.button('Ya, Booking')()); assert.equal(h.postCalls.length, 0); await h.unmount();
});

test('documents approved known limitation: summary A hides approved renewal B', async () => {
  // Current /me selects A and omits B; backend B6 could allow a session in B.
  // Passing this test documents the limitation, NOT a pass for renewal acceptance.
  const h = setup({ payload: true, membership: {
    is_active: true, status: 'active', start_date: '2098-01-01', end_date: '2098-12-31',
  } });
  await h.mount(); assert.equal(h.buttonProps('Booking Kelas').disabled, true);
  assert.match(h.text(), /sebelum tanggal sesi/); await h.unmount();
});

test('cancelled booking can rebook and adopts server participant count', async () => {
  const h = setup({ payload: true, bookings: [{ id: 2, status: 'cancelled', schedule: { id: 7, participants_count: 3 } }] });
  await h.mount(); await act(async () => h.button('Booking Kelas')());
  await act(async () => h.button('Ya, Booking')());
  assert.equal(h.postCalls.length, 1); assert.equal(h.counterProps().current, 4);
  assert.equal(h.buttonProps('Sudah Terdaftar').disabled, true); await h.unmount();
});

async function loadSchedule(raw, view = 'detail') {
  const h = setup({ view }); await h.mount();
  if (view === 'list') await h.refreshList();
  await act(async () => h.detailCalls[0].resolve({ data: { data: [raw] } }));
  return h;
}

for (const [id, count] of [['TC-SC01', 3], ['TC-SC02', 5], ['TC-SC03', 9]]) {
  test(`${id}: count ${count} vs minimum 5 is informative, never full`, async () => {
    const raw = { ...fixture, participants_count: count };
    const list = await loadSchedule(raw, 'list');
    assert.ok(list.text().includes(`${count} (Min. 5) Peserta`));
    assert.doesNotMatch(list.text(), /PENUH|Penuh|Kapasitas Maksimal/);
    await act(async () => list.button('Yoga')());
    assert.equal(list.navigation[0].pathname, '/schedule/7');
    const routed = JSON.parse(list.navigation[0].params.scheduleData);
    assert.equal(routed.participants_count, count);
    assert.equal(routed.min_participants, 5);
    await list.unmount();
    const detail = await loadSchedule(routed);
    assert.equal(detail.counterProps().current, count);
    assert.equal(detail.counterProps().min, 5);
    assert.equal(detail.buttonProps('Booking Kelas').disabled, false);
    if (count >= 5) assert.match(detail.text(), /Minimum terpenuhi/);
    assert.doesNotMatch(detail.text(), /PENUH|Penuh/);
    await act(async () => detail.button('Booking Kelas')());
    await act(async () => detail.button('Ya, Booking')());
    assert.equal(detail.postCalls.length, 1);
    await detail.unmount();
  });
}

for (const legacy of [{ max_participants: 2 }, { max_capacity: 2 }, { gym_class: { max_participants: 2 } }]) {
  test(`TC-SC04: legacy maximum ignored ${JSON.stringify(legacy)}`, async () => {
    const raw = { ...fixture, participants_count: 8, ...legacy };
    const h = await loadSchedule(raw, 'list');
    assert.ok(h.text().includes('8 (Min. 5) Peserta'));
    assert.ok(!h.text().includes('8/2 Peserta'));
    assert.doesNotMatch(h.text(), /PENUH|Penuh|Kapasitas Maksimal/);
    const normalized = h.schedules.normalizeScheduleItem(raw);
    for (const name of ['max_participants', 'max_capacity', 'has_max_capacity']) assert.equal(name in normalized, false);
    await h.unmount();
    const detail = await loadSchedule(raw);
    assert.equal(detail.buttonProps('Booking Kelas').disabled, false);
    await act(async () => detail.button('Booking Kelas')());
    await act(async () => detail.button('Ya, Booking')());
    assert.equal(detail.postCalls.length, 1); await detail.unmount();
  });
}

test('TC-SC05: full legacy status is unknown on list/detail and cannot POST', async () => {
  const raw = { ...fixture, status: 'full' };
  const list = await loadSchedule(raw, 'list');
  assert.match(list.text(), /TIDAK DIKETAHUI/); assert.doesNotMatch(list.text(), /PENUH|Penuh/);
  assert.equal(list.schedules.normalizeScheduleItem(raw).status, 'unknown'); await list.unmount();
  const detail = await loadSchedule(raw);
  assert.equal(detail.buttonProps('Booking Kelas').disabled, true);
  assert.equal(detail.badgeProps().customText, 'Tidak Diketahui');
  assert.doesNotMatch(detail.text(), /PENUH|Penuh/);
  await act(async () => detail.button('Ya, Booking')());
  assert.equal(detail.postCalls.length, 0); await detail.unmount();
});

test('TC-SC06: scheduled remains scheduled and eligible', async () => {
  const h = await loadSchedule(fixture);
  assert.equal(h.badgeProps().status, 'scheduled');
  assert.equal(h.buttonProps('Booking Kelas').disabled, false); await h.unmount();
});

for (const status of ['cancelled', 'completed']) {
  test(`TC-SC07: ${status} remains unavailable; cancelled reason preserved`, async () => {
    const raw = { ...fixture, status, cancel_reason: status === 'cancelled' ? 'Instruktur berhalangan' : undefined };
    const list = await loadSchedule(raw, 'list');
    assert.match(list.text(), status === 'cancelled' ? /DIBATALKAN/ : /SELESAI/);
    if (status === 'cancelled') assert.match(list.text(), /Instruktur berhalangan/);
    await list.unmount();
    const detail = await loadSchedule(raw);
    assert.equal(detail.badgeProps().status, status);
    if (status === 'cancelled') assert.match(detail.text(), /Instruktur berhalangan/);
    await act(async () => detail.button('Ya, Booking')());
    assert.equal(detail.postCalls.length, 0); await detail.unmount();
  });
}

test('TC-SC08: API-only payload without maximum renders and keeps actual counter', async () => {
  const h = await loadSchedule(fixture, 'list');
  assert.ok(h.text().includes('3 (Min. 5) Peserta'));
  assert.doesNotMatch(h.text(), /NaN|undefined|PENUH|Penuh/); await h.unmount();
});

for (const min of [null, undefined, -1, '5']) {
  test(`TC-SC09: minimum ${JSON.stringify(min)} stays unknown without invented zero`, async () => {
    const raw = { ...fixture, min_participants: min };
    const list = await loadSchedule(raw, 'list');
    assert.ok(list.text().includes('3 Peserta')); assert.doesNotMatch(list.text(), /Min\./); await list.unmount();
    const detail = await loadSchedule(raw);
    assert.match(detail.text(), /Minimum belum tersedia/); assert.doesNotMatch(detail.text(), /Minimum terpenuhi/);
    assert.equal(detail.buttonProps('Booking Kelas').disabled, false); await detail.unmount();
  });
}

test('TC-SC09: explicit minimum zero remains valid without limiting booking', async () => {
  const h = await loadSchedule({ ...fixture, min_participants: 0 });
  assert.equal(h.counterProps().min, 0); assert.match(h.text(), /Minimum terpenuhi/);
  assert.equal(h.buttonProps('Booking Kelas').disabled, false); await h.unmount();
});
// TC-SC10 is covered by the original 48 lifecycle/B6/WITA/409/422/counter tests above.

// HTTP 409 is a conflict, never a new successful booking. Use real screen effects.
const conflict409 = () => Promise.reject({ response: { status: 409, data: { message: 'Anda sudah booking sesi kelas ini.' } } });
const ownBookingResponse = (status = 'booked', count = 12) => ({ data: { data: [
  { id: 21, status, schedule: { id: '7', participants_count: count } },
] } });
async function submitConflict(h) {
  h.setPost(conflict409);
  await act(async () => h.button('Booking Kelas')());
  await act(async () => h.button('Ya, Booking')());
}
for (const status of ['booked', 'attended']) {
  test(`TC-409-01: conflict reconciles ${status} and authoritative counter without reopening`, async () => {
    const h = setup({ payload: true }); await h.mount();
    h.setGet((url) => url === '/api/v1/member/bookings' ? Promise.resolve(ownBookingResponse(status, 12)) : undefined);
    await submitConflict(h);
    assert.equal(h.getCalls.filter((x) => x === '/api/v1/member/bookings').length, 2);
    assert.equal(h.buttonProps('Sudah Terdaftar').disabled, true);
    assert.equal(h.counterProps().current, 12);
    assert.match(h.text(), /Anda sudah booking sesi kelas ini/);
    assert.doesNotMatch(h.text(), /Booking Berhasil/);
    assert.equal(h.postCalls.length, 1); await h.unmount();
  });
}
test('TC-409-01: missing booking counter falls back to date-filtered schedules', async () => {
  const h = setup({ payload: true }); await h.mount(); let options;
  // Omit the field rather than use the helper's default count.
  h.setGet((url, config) => {
    if (url === '/api/v1/member/bookings') return Promise.resolve({ data: { data: [{ status: 'booked', schedule: { id: 7 } }] } });
    if (url === '/api/v1/class-schedules') { options = config; return Promise.resolve({ data: { data: [{ ...fixture, participants_count: 17 }] } }); }
  });
  await submitConflict(h);
  assert.equal(h.counterProps().current, 17); assert.equal(h.buttonProps('Sudah Terdaftar').disabled, true);
  assert.deepEqual(JSON.parse(JSON.stringify(options.params)), { date_from: '2099-01-01', date_to: '2099-01-01' });
  assert.ok(options.headers.Authorization); assert.equal(options.signal.aborted, false);
  await h.unmount();
});
test('TC-409-02: failed reconciliation stays fail-closed; retry adopts server state', async () => {
  const h = setup({ payload: true }); await h.mount();
  h.setGet((url) => url === '/api/v1/member/bookings' ? Promise.reject(new Error('Booking service unavailable')) : undefined);
  await submitConflict(h);
  assert.match(h.text(), /Booking service unavailable/); assert.match(h.text(), /Coba Lagi/);
  assert.doesNotMatch(h.text(), /Booking Berhasil/); assert.equal(h.counterProps().current, 3);
  assert.doesNotMatch(h.text(), /"Booking Kelas"/);
  await act(async () => h.button('Mengerti')());
  h.setGet((url) => url === '/api/v1/member/bookings' ? Promise.resolve(ownBookingResponse('booked', 9)) : undefined);
  await act(async () => h.button('Coba Lagi')());
  assert.equal(h.counterProps().current, 9); assert.equal(h.buttonProps('Sudah Terdaftar').disabled, true);
  assert.equal(h.postCalls.length, 1); await h.unmount();
});
for (const list of [null, [], [{ ...fixture, participants_count: 'invalid' }]]) {
  test(`TC-409-02: unavailable authoritative counter cannot silently unlock booking ${JSON.stringify(list)}`, async () => {
    const h = setup({ payload: true }); await h.mount();
    h.setGet((url) => {
      if (url === '/api/v1/member/bookings') return Promise.resolve({ data: { data: [] } });
      if (url === '/api/v1/class-schedules') return Promise.resolve({ data: { data: list } });
    });
    await submitConflict(h);
    assert.match(h.text(), /Coba Lagi/); assert.doesNotMatch(h.text(), /"Booking Kelas"/);
    assert.equal(h.counterProps().current, 3); assert.equal(h.postCalls.length, 1); await h.unmount();
  });
}
test('TC-409-02: pending reconciliation blocks stale confirmation callbacks synchronously', async () => {
  const h = setup({ payload: true }); await h.mount(); const pending = deferred();
  await act(async () => h.button('Booking Kelas')()); const confirm = h.button('Ya, Booking');
  h.setPost(conflict409);
  h.setGet((url) => url === '/api/v1/member/bookings' ? pending.promise : undefined);
  await act(async () => { void confirm(); });
  assert.match(h.text(), /Memverifikasi/);
  await act(async () => { void confirm(); void confirm(); });
  assert.equal(h.postCalls.length, 1);
  await act(async () => pending.resolve(ownBookingResponse('booked', 7)));
  assert.equal(h.counterProps().current, 7); assert.equal(h.buttonProps('Sudah Terdaftar').disabled, true);
  await h.unmount();
});
for (const outcome of ['resolve', 'reject']) {
  test(`TC-409-03: older reconciliation ${outcome}/finally cannot overwrite newer retry`, async () => {
    const h = setup({ payload: true }); await h.mount();
    h.setGet((url) => url === '/api/v1/member/bookings' ? Promise.reject(new Error('offline')) : undefined);
    await submitConflict(h); await act(async () => h.button('Mengerti')()); const retry = h.button('Coba Lagi'); const a = deferred(), b = deferred(); let calls = 0;
    h.setGet((url) => url === '/api/v1/member/bookings' ? (++calls === 1 ? a.promise : b.promise) : undefined);
    await act(async () => { void retry(); void retry(); });
    await act(async () => b.resolve(ownBookingResponse('booked', 8)));
    await act(async () => outcome === 'resolve' ? a.resolve(ownBookingResponse('cancelled', 99)) : a.reject(new Error('obsolete failure')));
    assert.equal(h.counterProps().current, 8); assert.equal(h.buttonProps('Sudah Terdaftar').disabled, true);
    assert.doesNotMatch(h.text(), /obsolete failure/); assert.equal(calls, 2); await h.unmount();
  });
}
test('TC-409-03: old account reconciliation cannot change the new auth context', async () => {
  const h = setup({ payload: true }); await h.mount(); const old = deferred();
  h.setPost(conflict409); h.setGet((url) => url === '/api/v1/member/bookings' ? old.promise : undefined);
  await act(async () => h.button('Booking Kelas')()); await act(async () => { void h.button('Ya, Booking')(); });
  h.setGet(() => undefined); await h.auth({ isLoading: false, userToken: 'new-test-context' });
  await act(async () => old.resolve(ownBookingResponse('booked', 99)));
  assert.equal(h.counterProps().current, 3); assert.equal(h.buttonProps('Booking Kelas').disabled, false);
  assert.equal(h.postCalls.length, 1); await h.unmount();
});
test('TC-409-03: reconciliation completion after unmount starts no counter fallback', async () => {
  const h = setup({ payload: true }); await h.mount(); const pending = deferred();
  h.setPost(conflict409);h.setGet((url) => url === '/api/v1/member/bookings' ? pending.promise : undefined);
  await act(async () => h.button('Booking Kelas')());await act(async () => { void h.button('Ya, Booking')(); });
  await h.unmount(); const before = h.getCalls.length;
  await act(async () => pending.resolve({ data: { data: [] } }));
  assert.equal(h.getCalls.length, before);
});
test('TC-409-03: POST conflict received after unmount must not start reconciliation', async () => {
  const h = setup({ payload: true }); const pending = deferred(); h.setPost(() => pending.promise); await h.mount();
  await act(async () => h.button('Booking Kelas')()); await act(async () => { void h.button('Ya, Booking')(); });
  await h.unmount(); const before = h.getCalls.length;
  await act(async () => pending.reject({ response: { status: 409 } })); assert.equal(h.getCalls.length, before);
});
test('TC-409-07: cancelled reconciliation permits eligible rebooking; 201 counter stays authoritative', async () => {
  const h = setup({ payload: true }); await h.mount();
  h.setGet((url) => url === '/api/v1/member/bookings' ? Promise.resolve(ownBookingResponse('cancelled', 2)) : undefined);
  await submitConflict(h); assert.equal(h.counterProps().current, 2); assert.equal(h.buttonProps('Booking Kelas').disabled, false);
  h.setPost(() => Promise.resolve({ data: { data: { schedule: { participants_count: 6 } } } }));
  await act(async () => h.button('Booking Kelas')()); await act(async () => h.button('Ya, Booking')());
  assert.equal(h.postCalls.length, 2); assert.equal(h.counterProps().current, 6);
  assert.equal(h.buttonProps('Sudah Terdaftar').disabled, true); await h.unmount();
});
test('TC-409-guard: HTTP 401 keeps unauthorized flow and makes no reconciliation requests', async () => {
  const h = setup({ payload: true }); await h.mount(); const before = h.getCalls.length;
  h.setPost(() => Promise.reject({ response: { status: 401 } }));
  await act(async () => h.button('Booking Kelas')()); await act(async () => h.button('Ya, Booking')());
  assert.match(h.text(), /Sesi Berakhir/); assert.equal(h.getCalls.length, before); assert.equal(h.counterProps().current, 3);
  await h.unmount();
});

test('TC-409-02: counter endpoint failure stays blocked until a successful retry', async () => {
  const h = setup({ payload: true }); await h.mount(); let fail = true;
  h.setGet((url) => {
    if (url === '/api/v1/member/bookings') return Promise.resolve({ data: { data: [{ status: 'booked', schedule: { id: 7 } }] } });
    if (url === '/api/v1/class-schedules') return fail ? Promise.reject(new Error('counter offline')) : Promise.resolve({ data: { data: [{ ...fixture, participants_count: 15 }] } });
  });
  await submitConflict(h); assert.match(h.text(), /counter offline/); assert.doesNotMatch(h.text(), /"Booking Kelas"/);
  assert.equal(h.counterProps().current, 3); fail = false;
  await act(async () => h.button('Mengerti')()); await act(async () => h.button('Coba Lagi')());
  assert.equal(h.counterProps().current, 15); assert.equal(h.buttonProps('Sudah Terdaftar').disabled, true);
  assert.equal(h.postCalls.length, 1); await h.unmount();
});
for (const outcome of ['resolve', 'reject']) {
  test(`TC-409-03: obsolete counter fallback ${outcome} cannot overwrite a newer reconciliation`, async () => {
    const h = setup({ payload: true }); await h.mount();
    h.setGet((url) => url === '/api/v1/member/bookings' ? Promise.reject(new Error('initial offline')) : undefined);
    await submitConflict(h); await act(async () => h.button('Mengerti')()); const retry = h.button('Coba Lagi');
    const oldCounter = deferred(); let bookingCalls = 0;
    h.setGet((url) => {
      if (url === '/api/v1/member/bookings') return Promise.resolve(++bookingCalls === 1
        ? { data: { data: [{ status: 'booked', schedule: { id: 7 } }] } }
        : ownBookingResponse('booked', 18));
      if (url === '/api/v1/class-schedules') return oldCounter.promise;
    });
    await act(async () => { void retry(); });
    assert.match(h.text(), /Memverifikasi/);
    await act(async () => retry());
    await act(async () => outcome === 'resolve'
      ? oldCounter.resolve({ data: { data: [{ ...fixture, participants_count: 99 }] } })
      : oldCounter.reject(new Error('old counter failed')));
    assert.equal(h.counterProps().current, 18); assert.equal(h.buttonProps('Sudah Terdaftar').disabled, true);
    assert.doesNotMatch(h.text(), /old counter failed/); await h.unmount();
  });
}
test('TC-409-02: fallback snapshot preserves cancellation eligibility instead of enabling rebooking', async () => {
  const h = setup({ payload: true }); await h.mount();
  h.setGet((url) => {
    if (url === '/api/v1/member/bookings') return Promise.resolve({ data: { data: [] } });
    if (url === '/api/v1/class-schedules') return Promise.resolve({ data: { data: [{ ...fixture, participants_count: 2, status: 'cancelled', cancel_reason: 'QA cancellation' }] } });
  });
  await submitConflict(h); assert.equal(h.counterProps().current, 2);
  assert.equal(h.badgeProps().status, 'cancelled'); assert.match(h.text(), /QA cancellation/);
  assert.doesNotMatch(h.text(), /"Booking Kelas"/); assert.equal(h.postCalls.length, 1); await h.unmount();
});


test('SCRUM72/85 merge: card navigation and Chat Admin remain separate actions', async () => {
  const h = await loadSchedule(fixture, 'list');
  assert.equal(h.chatProps().context, 'schedule');
  assert.deepEqual(JSON.parse(JSON.stringify(h.chatProps().data)), {
    className: 'Yoga', date: '2099-01-01', sessionTime: '10:00 - 11:00 WITA',
  });
  assert.equal(h.chatHasNavigationAncestor(), false);
  await act(async () => h.button('Yoga')());
  assert.equal(h.navigation.length, 1);
  assert.equal(h.navigation[0].pathname, '/schedule/7');
  const routed = JSON.parse(h.navigation[0].params.scheduleData);
  assert.equal(routed.status, 'scheduled');
  assert.equal(routed.participants_count, 3);
  await act(async () => h.button('Chat Admin')());
  assert.deepEqual(h.openedChatLinks, ['https://example.test/qa-chat']);
  assert.equal(h.navigation.length, 1);
  assert.equal(h.postCalls.length, 0);
  await h.unmount();
});


// SCRUM-73 runs the real detail screen with the same native host mocks.
const statusUrl = '/api/v1/class-schedules/status';
const listUrl = '/api/v1/class-schedules';
const bookingsUrl = '/api/v1/member/bookings';
const stamp = (second) => '2026-11-27T08:00:' + String(second).padStart(2, '0') + '+08:00';
const statusReply = (status, count, second = 1, id = 7, min = 5) => ({
  status: 200, data: { data: [
    { id: id + 100, status: 'cancelled', participants_count: 91, min_participants: 80, updated_at: stamp(second) },
    { id, status, participants_count: count, min_participants: min, updated_at: stamp(second) },
  ] },
});
const listReply = (status, count, second, reason = null) => ({
  data: { data: [{ ...fixture, status, participants_count: count, updated_at: stamp(second), cancel_reason: reason }] },
});
const refreshDetail = (h) => act(async () => h.refreshProps().onRefresh());

test('SCRUM-73: poll merges by ID, updates both counter directions and keeps the same scroll host', async () => {
  const h = setup({ payload: true });
  let count = 3, min = 5;
  h.setGet((url) => url === statusUrl ? Promise.resolve(statusReply('scheduled', count, 1, 7, min)) : undefined);
  await h.mount();
  const refresh = h.refreshProps().onRefresh;
  assert.equal(h.counterProps().current, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(h.statusCalls[0].params)), {
    date_from: fixture.schedule_date, date_to: fixture.schedule_date,
  });
  count = 4;
  await h.advance(14999);
  assert.equal(h.statusCalls.length, 1);
  await h.advance(1);
  assert.equal(h.counterProps().current, 4);
  assert.equal(h.refreshProps().onRefresh, refresh);
  assert.equal(h.refreshProps().refreshing, false);
  assert.doesNotMatch(h.text(), /Memuat detail/);
  assert.match(h.text(), /Yoga.*Instructor/);
  count = 3; min = 6;
  await h.advance(15000);
  assert.equal(h.counterProps().current, 3);
  assert.equal(h.counterProps().min, 6);
  assert.equal(h.buttonProps('Booking Kelas').disabled, false);
  assert.equal(h.listenerCount(), 1);
  assert.equal(h.activeTimers().filter((delay) => delay === 15000).length, 1);
  await h.unmount();
});

test('SCRUM-73: late private snapshot cannot undo cancellation or restore the old booking after reschedule', async () => {
  const h = setup({ payload: true });
  const old = deferred(), cancelled = deferred();
  let current = statusReply('scheduled', 3, 1);
  let bookingCalls = 0;
  h.setGet((url) => {
    if (url === bookingsUrl) return ++bookingCalls === 1
      ? old.promise : Promise.resolve(ownBookingResponse('cancelled', 0));
    if (url === statusUrl) return Promise.resolve(current);
    if (url === listUrl) return cancelled.promise;
  });
  await h.mount();
  current = statusReply('cancelled', 0, 3);
  await h.advance(15000);
  await act(async () => cancelled.resolve(listReply('cancelled', 0, 3, 'QA admin cancelled')));
  assert.equal(h.badgeProps().status, 'cancelled');
  assert.equal(h.counterProps().current, 0);
  assert.match(h.text(), /QA admin cancelled/);
  const oldBooked = ownBookingResponse('booked', 88);
  oldBooked.data.data[0].schedule.status = 'scheduled';
  await act(async () => old.resolve(oldBooked));
  assert.equal(h.badgeProps().status, 'cancelled');
  assert.equal(h.counterProps().current, 0);
  assert.doesNotMatch(h.text(), /Booking Kelas|Sudah Terdaftar/);

  // The status differs, but the older timestamp still makes it obsolete.
  current = statusReply('scheduled', 77, 2);
  await h.advance(15000);
  assert.equal(h.badgeProps().status, 'cancelled');
  // A later request in the same backend second may legitimately reschedule.
  current = statusReply('scheduled', 0, 3);
  await h.advance(15000);
  assert.equal(h.badgeProps().status, 'scheduled');
  assert.equal(h.counterProps().current, 0);
  assert.doesNotMatch(h.text(), /QA admin cancelled|Sudah Terdaftar/);
  assert.equal(h.buttonProps('Booking Kelas').disabled, false);
  await h.unmount();
});

test('SCRUM-73: forced refresh aborts the older poll and ignores late same-second data', async () => {
  const h = setup({ payload: true });
  const first = deferred();
  let polls = 0;
  h.setGet((url) => url === statusUrl
    ? (++polls === 1 ? first.promise : Promise.resolve(statusReply('scheduled', 8, 1))) : undefined);
  await h.mount();
  await h.advance(15000);
  assert.equal(h.statusCalls.length, 1, 'overlapping periodic tick is skipped');
  await refreshDetail(h);
  assert.equal(h.statusCalls[0].signal.aborted, true);
  await act(async () => first.resolve(statusReply('scheduled', 99, 1)));
  assert.equal(h.counterProps().current, 8);
  assert.equal(h.refreshProps().refreshing, false);
  await h.unmount();
});

for (const succeeds of [true, false]) {
  test('SCRUM-73: refresh inherits initial eligibility loading (' + (succeeds ? 'success' : 'failure') + ')', async () => {
    const h = setup({ payload: true });
    const first = deferred(), replacement = deferred();
    let reads = 0;
    h.setGet((url) => url === bookingsUrl ? (++reads === 1 ? first.promise : replacement.promise) : undefined);
    await h.mount();
    assert.match(h.text(), /Memverifikasi/);
    const refresh = h.refreshProps().onRefresh;
    await act(async () => { void refresh(); });
    assert.equal(h.refreshProps().refreshing, true);
    await act(async () => first.resolve(ownBookingResponse('booked', 99)));
    assert.match(h.text(), /Memverifikasi/);
    assert.equal(h.refreshProps().refreshing, true);
    await act(async () => succeeds ? replacement.resolve({ data: { data: [] } }) : replacement.reject(new Error('QA offline')));
    assert.doesNotMatch(h.text(), /Memverifikasi|Sudah Terdaftar/);
    assert.equal(h.refreshProps().refreshing, false);
    if (!succeeds) {
      assert.match(h.text(), /QA offline/);
      h.setGet(() => undefined);
      await refreshDetail(h);
    }
    assert.equal(h.buttonProps('Booking Kelas').disabled, false);
    await h.unmount();
  });
}

for (const boundary of ['blur', 'background']) {
  test('SCRUM-73: POST completion during ' + boundary + ' reconciles on return and cleans timers', async () => {
    const h = setup({ payload: true });
    const post = deferred();
    h.setPost(() => post.promise);
    await h.mount();
    await act(async () => h.button('Booking Kelas')());
    const confirm = h.button('Ya, Booking');
    await act(async () => { void confirm(); void confirm(); });
    assert.equal(h.postCalls.length, 1);
    if (boundary === 'blur') await h.focus(false);
    else await h.appState('background');
    const before = h.statusCalls.length;
    const privateBefore = h.getCalls.length;
    assert.equal(h.activeTimers().length, 0);
    assert.equal(h.listenerCount(), boundary === 'blur' ? 0 : 1);
    await act(async () => post.resolve({ data: { data: { schedule: { participants_count: 4 } } } }));
    await h.advance(60000);
    assert.equal(h.statusCalls.length, before);
    assert.equal(h.getCalls.length, privateBefore);
    h.setGet((url) => {
      if (url === statusUrl) return Promise.resolve(statusReply('scheduled', 4));
      if (url === bookingsUrl) return Promise.resolve(ownBookingResponse('booked', 4));
    });
    if (boundary === 'blur') await h.focus(true);
    else await h.appState('active');
    assert.equal(h.statusCalls.length, before + 1);
    assert.equal(h.counterProps().current, 4);
    assert.equal(h.buttonProps('Sudah Terdaftar').disabled, true);
    assert.equal(h.listenerCount(), 1);
    assert.equal(h.activeTimers().filter((ms) => ms === 15000).length, 1);
    await h.unmount();
    assert.equal(h.activeTimers().length, 0);
    assert.equal(h.listenerCount(), 0);
  });
}

test('SCRUM-73: HTTP 409 completion in background stays locked until foreground reconciliation', async () => {
  const h = setup({ payload: true });
  const mutation = deferred(), reconciliation = deferred();
  h.setPost(() => mutation.promise);
  await h.mount();
  await act(async () => h.button('Booking Kelas')());
  const confirm = h.button('Ya, Booking');
  await act(async () => { void confirm(); });
  await h.appState('background');
  const before = h.getCalls.length;
  await act(async () => mutation.reject({ response: { status: 409 } }));
  assert.equal(h.getCalls.length, before);
  h.setGet((url) => url === bookingsUrl ? reconciliation.promise : undefined);
  await h.appState('active');
  await act(async () => { void confirm(); });
  assert.equal(h.postCalls.length, 1);
  await act(async () => reconciliation.resolve(ownBookingResponse('booked', 6)));
  assert.equal(h.counterProps().current, 6);
  assert.equal(h.buttonProps('Sudah Terdaftar').disabled, true);
  await h.unmount();
});

test('SCRUM-73: abort old polls on route or account change, wait for auth, and stop private GET on logout', async () => {
  const h = setup({ payload: true, restoring: true });
  const oldRoute = deferred(), oldAccount = deferred();
  h.setGet((url) => url === statusUrl ? oldRoute.promise : undefined);
  await h.mount();
  assert.equal(h.statusCalls.length, 0);
  assert.equal(h.getCalls.length, 0);
  await h.auth({ isLoading: false, userToken: 'test-first-account' });
  h.setGet((url) => url === statusUrl ? oldAccount.promise : undefined);
  await h.route({ ...fixture, id: 8, class_name: 'Pilates', participants_count: 2 });
  assert.equal(h.statusCalls[0].signal.aborted, true);
  const loggedOutBefore = h.getCalls.length;
  h.setGet((url) => url === statusUrl ? Promise.resolve(statusReply('scheduled', 6, 4, 8)) : undefined);
  await h.auth({ isLoading: false, userToken: null });
  assert.equal(h.statusCalls[1].signal.aborted, true);
  assert.equal(h.getCalls.length, loggedOutBefore, 'logged-out context sends no private GET');
  await h.auth({ isLoading: false, userToken: 'test-second-account' });
  await act(async () => {
    oldRoute.resolve(statusReply('cancelled', 77, 5, 7));
    oldAccount.resolve(statusReply('cancelled', 88, 5, 8));
  });
  assert.match(h.text(), /Pilates/);
  assert.equal(h.counterProps().current, 6);
  assert.equal(h.badgeProps().status, 'scheduled');
  await h.unmount();
});

test('SCRUM-73: booking applies authoritative count, ignoring polling started before POST', async () => {
  const h = setup({ payload: true });
  const preMutation = deferred();
  let calls = 0;
  h.setGet((url) => url === statusUrl
    ? (++calls === 1 ? preMutation.promise : Promise.resolve({ status: 304 })) : undefined);
  h.setPost(() => Promise.resolve({ data: { data: { schedule: { participants_count: 8 } } } }));
  await h.mount();
  await act(async () => h.button('Booking Kelas')());
  await act(async () => h.button('Ya, Booking')());
  assert.equal(h.statusCalls[0].signal.aborted, true);
  await act(async () => preMutation.resolve(statusReply('scheduled', 2)));
  assert.equal(h.counterProps().current, 8);
  assert.equal(h.buttonProps('Sudah Terdaftar').disabled, true);
  await h.unmount();
});

test('SCRUM-73: admin cancellation replaces an open confirmation and uses the full reason', async () => {
  const h = setup({ payload: true });
  await h.mount();
  await act(async () => h.button('Booking Kelas')());
  const confirm = h.button('Ya, Booking');
  h.setGet((url) => {
    if (url === statusUrl) return Promise.resolve(statusReply('cancelled', 0, 2));
    if (url === listUrl) return Promise.resolve(listReply('cancelled', 0, 2, 'Jadwal QA dibatalkan'));
  });
  await h.advance(15000);
  assert.match(h.text(), /Jadwal QA dibatalkan/);
  assert.doesNotMatch(h.text(), /Ya, Booking|"Booking Kelas"/);
  await act(async () => confirm());
  assert.equal(h.postCalls.length, 0, 'retained callback cannot submit after cancellation');
  await h.unmount();
});

test('SCRUM-73: failed cancellation fallback disables booking and reports an incomplete refresh', async () => {
  const h = setup({ payload: true });
  await h.mount();
  h.setGet((url) => {
    if (url === statusUrl) return Promise.resolve(statusReply('cancelled', 0, 4));
    if (url === listUrl) return Promise.reject(new Error('reason request offline'));
  });
  await refreshDetail(h);
  assert.equal(h.badgeProps().status, 'cancelled');
  assert.doesNotMatch(h.text(), /"Booking Kelas"/);
  assert.match(h.text(), /Gagal memperbarui/);
  assert.match(h.text(), /Alasan pembatalan belum tersedia/);
  assert.equal(h.refreshProps().refreshing, false);
  h.setGet((url) => {
    if (url === statusUrl) return Promise.resolve(statusReply('cancelled', 0, 4));
    if (url === listUrl) return Promise.resolve(listReply('cancelled', 0, 4, 'Reason recovered'));
  });
  await refreshDetail(h);
  assert.match(h.text(), /Reason recovered/);
  assert.doesNotMatch(h.text(), /Gagal memperbarui/);
  await h.unmount();
});

test('SCRUM-73: fallback uses the newer full reschedule as one snapshot', async () => {
  const h = setup({ payload: true, bookings: ownBookingResponse('booked', 3).data.data });
  const pending = deferred();
  await h.mount();
  h.setGet((url) => {
    if (url === statusUrl) return Promise.resolve(statusReply('cancelled', 0, 4));
    if (url === listUrl) return pending.promise;
  });
  await h.advance(15000);
  await act(async () => pending.resolve(listReply('scheduled', 2, 5)));
  assert.equal(h.badgeProps().status, 'scheduled');
  assert.equal(h.counterProps().current, 2);
  assert.equal(h.buttonProps('Booking Kelas').disabled, false);
  assert.doesNotMatch(h.text(), /Sesi Dibatalkan|Sudah Terdaftar/);
  await h.unmount();
});

test('SCRUM-73: 304 keeps existing data; a missing ID is a visible distinct outcome', async () => {
  const h = setup({ payload: true });
  await h.mount();
  await refreshDetail(h);
  assert.equal(h.statusCalls.at(-1).validateStatus(304), true);
  assert.equal(h.statusCalls.at(-1).timeout, 12000);
  assert.equal(h.counterProps().current, 3);
  assert.doesNotMatch(h.text(), /Gagal memperbarui|Sesi tidak ditemukan/);
  h.setGet((url) => url === statusUrl ? Promise.resolve({ data: { data: [{ id: 999 }] } }) : undefined);
  await refreshDetail(h);
  assert.match(h.text(), /Sesi tidak ditemukan/);
  assert.equal(h.refreshProps().refreshing, false);
  assert.equal(h.counterProps().current, 3);
  await h.unmount();
});

for (const code of [429, 500, 'offline']) {
  test('SCRUM-73: recovers after ' + code + ' and bounded backoff', async () => {
    const h = setup({ payload: true });
    let offline = true;
    h.setGet((url) => {
      if (url !== statusUrl) return;
      if (!offline) return Promise.resolve(statusReply('scheduled', 6));
      if (code === 'offline') return Promise.reject(new Error('network unreachable'));
      return Promise.reject({ response: { status: code, headers: { 'retry-after': '45' } } });
    });
    await h.mount();
    offline = false;
    await h.advance(29999);
    assert.equal(h.statusCalls.length, 1);
    await h.advance(code === 429 ? 15001 : 1);
    assert.equal(h.counterProps().current, 6);
    const recovered = h.statusCalls.length;
    await h.advance(15000);
    assert.equal(h.statusCalls.length, recovered + 1);
    await h.unmount();
  });
}



test('SCRUM-73: a 409 stays locked when the private read succeeds but the public status is missing', async () => {
  const h = setup({ payload: true });
  await h.mount();
  await act(async () => h.button('Booking Kelas')());
  const confirm = h.button('Ya, Booking');
  h.setPost(conflict409);
  h.setGet((url) => {
    if (url === statusUrl) return Promise.resolve({ data: { data: [] } });
    if (url === bookingsUrl) return Promise.resolve(ownBookingResponse('cancelled', 0));
  });
  await act(async () => confirm());
  assert.match(h.text(), /Status sesi belum dapat diverifikasi/);
  await act(async () => { void confirm(); });
  assert.equal(h.postCalls.length, 1);
  await act(async () => h.button('Mengerti')());
  h.setGet((url) => {
    if (url === statusUrl) return Promise.resolve(statusReply('scheduled', 1, 2));
    if (url === bookingsUrl) return Promise.resolve(ownBookingResponse('cancelled', 0));
  });
  await act(async () => h.button('Coba Lagi')());
  assert.equal(h.counterProps().current, 1);
  assert.equal(h.buttonProps('Booking Kelas').disabled, false);
  await h.unmount();
});

test('SCRUM-73: a 422 from booking after admin cancellation triggers immediate polling', async () => {
  const h = setup({ payload: true });
  await h.mount();
  h.setPost(() => Promise.reject({ response: { status: 422, data: { message: 'Sesi sudah dibatalkan.' } } }));
  h.setGet((url) => {
    if (url === statusUrl) return Promise.resolve(statusReply('cancelled', 0, 2));
    if (url === listUrl) return Promise.resolve(listReply('cancelled', 0, 2, 'Admin cancelled in QA'));
  });
  await act(async () => h.button('Booking Kelas')());
  await act(async () => h.button('Ya, Booking')());
  assert.equal(h.statusCalls.length, 2);
  assert.equal(h.badgeProps().status, 'cancelled');
  assert.match(h.text(), /Admin cancelled in QA/);
  assert.doesNotMatch(h.text(), /Booking Berhasil|"Booking Kelas"/);
  await h.unmount();
});

test('SCRUM-73: background aborts both refresh requests and clears its spinner', async () => {
  const h = setup({ payload: true });
  await h.mount();
  const poll = deferred(), verification = deferred();
  let privateSignal;
  h.setGet((url, config) => {
    if (url === statusUrl) return poll.promise;
    if (url === bookingsUrl) {
      privateSignal = config.signal;
      return verification.promise;
    }
  });
  const refresh = h.refreshProps().onRefresh;
  await act(async () => { void refresh(); });
  assert.equal(h.refreshProps().refreshing, true);
  await h.appState('background');
  assert.equal(h.statusCalls.at(-1).signal.aborted, true);
  assert.equal(privateSignal.aborted, true);
  assert.equal(h.refreshProps().refreshing, false);
  await act(async () => {
    poll.resolve(statusReply('scheduled', 99));
    verification.resolve(ownBookingResponse('booked', 99));
  });
  assert.equal(h.counterProps().current, 3);
  assert.doesNotMatch(h.text(), /Pembaruan terhenti|Sudah Terdaftar/);
  await h.unmount();
});

test('SCRUM-73: TC3-37 inherited schedules screen shows cancellation on its next poll', async () => {
  const h = setup({ view: 'list', listLifecycle: true });
  let schedules = listReply('scheduled', 1, 1);
  h.setGet((url) => url === listUrl ? Promise.resolve(schedules) : undefined);
  await h.mount();
  assert.match(h.text(), /TERJADWAL/);
  schedules = listReply('cancelled', 0, 2, 'Admin cancelled both views');
  await h.advance(15000);
  assert.match(h.text(), /DIBATALKAN/);
  assert.match(h.text(), /Admin cancelled both views/);
  assert.match(h.text(), /0 \(Min\. 5\) Peserta/);
  await h.unmount();
  assert.equal(h.listenerCount(), 0);
  assert.equal(h.activeTimers().length, 0);
});
