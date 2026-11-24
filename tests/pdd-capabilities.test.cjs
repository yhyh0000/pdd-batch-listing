const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { capabilities, decide, CAPABILITY_LABEL } = require(
  path.join(__dirname, '..', 'dist-electron', 'electron', 'platforms', 'pdd-capabilities.js'),
);

// 三类真实类目造型（键名取自后台规则接口的真实返回），用来证明推断是「按键名归类」而不是写死类目。
const TIRE = {
  authentic_invoice: false,
  is_electronic_invoice: false,
  is_paper_invoice: false,
  allow_invoice_sub_type: false,
  must_set_invoice: false,
  can_set_wp_service: false,
  is_refundable: true,
  is_must_fake_one_lose_ten: false,
};

const PHONE = {
  authentic_invoice: false,
  is_electronic_invoice: true,
  must_set_invoice: true,
  allow_spec_template: false,
  refundable: true,
};

const APPAREL = {
  authentic_invoice: true,
  is_paper_invoice: true,
  allow_spec_template: true,
  allow_video: true,
  need_white_bg: false,
  buy_limit: [1, 2],
};

test('类目不提供的能力判成 unavailable，不会当成我们的缺陷', () => {
  const caps = capabilities(TIRE);
  assert.equal(caps.invoice, 'unavailable');
  // 轮胎的 rules 只有 can_set_wp_service=false（那是上门/同城服务），
  // 而编辑页确实有「到店安装」，所以这里必须判 unknown 交给页面与读回，不能判成不提供。
  assert.equal(caps.installService, 'unknown');
  assert.equal(caps.refundable, 'available');
  assert.equal(decide('installService', true, caps).action, 'go');
});

test('类目要求的能力判成 required，优先于「提供与否」', () => {
  assert.equal(capabilities(PHONE).invoice, 'required');
  assert.equal(capabilities({ ...TIRE, must_set_invoice: true }).invoice, 'required');
});

test('提供了但没要求的能力判成 available', () => {
  const caps = capabilities(APPAREL);
  assert.equal(caps.invoice, 'available');
  assert.equal(caps.specTemplate, 'available');
  assert.equal(caps.video, 'available');
  assert.equal(caps.buyLimit, 'available');
});

test('规则里完全没有相关键时判成 unknown，交给读回兜底', () => {
  const caps = capabilities({ some_other_key: 1 });
  assert.equal(caps.invoice, 'unknown');
  assert.equal(decide('invoice', true, caps).action, 'go');
});

test('类目模板里带 spec_module 时，规格模板算提供', () => {
  const caps = capabilities({}, { spec_module: { id: 1, name: '轮胎规格' } });
  assert.equal(caps.specTemplate, 'available');
  assert.equal(capabilities({}, {}).specTemplate, 'unknown');
});

test('新增的能力键名自动归类，不需要改代码', () => {
  // 后台以后加了新键，只要名字里带 invoice / install_service 就会被认出来
  assert.equal(capabilities({ future_invoice_flag: true }).invoice, 'available');
  assert.equal(capabilities({ future_install_service_support: true }).installService, 'available');
  // can_set_wp_service 这类「上门服务」键不代表到店安装，判不准就给 unknown
  assert.equal(capabilities({ can_set_wp_service: false }).installService, 'unknown');
});

test('decide 三态：不提供就跳过、必须提供就停、其它照发', () => {
  const tire = capabilities(TIRE);
  const skip = decide('invoice', true, tire);
  assert.equal(skip.action, 'skip');
  assert.match(skip.note, /该类目不提供正品发票/);

  const phone = capabilities(PHONE);
  const stop = decide('invoice', true, phone);
  assert.equal(stop.action, 'stop');
  assert.match(stop.reason, /请先在浏览器里手工设置/);

  assert.equal(decide('invoice', false, tire).action, 'go');
  assert.equal(decide('refundable', true, tire).action, 'go');
});

test('九个能力的展示名齐全，方便界面直接用', () => {
  for (const key of Object.keys(CAPABILITY_LABEL)) assert.ok(CAPABILITY_LABEL[key]);
  assert.equal(CAPABILITY_LABEL.installService, '到店安装');
});

test('must_not_ 是反向要求，不能被 must_ 前缀误读成「必须提供」', () => {
  const fresh = capabilities({ is_refundable: false, must_not_refundable: true });
  assert.equal(fresh.refundable, 'unavailable');
  assert.equal(decide('refundable', true, fresh).action, 'skip');
  // 生鲜造型：必须不退货 + 无发票位
  const produce = capabilities({ must_not_refundable: true, is_refundable: false, authentic_invoice: false });
  assert.equal(produce.refundable, 'unavailable');
  assert.equal(produce.invoice, 'unavailable');
});
