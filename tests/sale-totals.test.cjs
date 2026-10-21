const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cents, decimal } = require('../.test-build/server/services/money.js');
const { calculateSaleTotals: calculate } = require('../.test-build/server/services/sale-totals.js');
const base = { items: [{ unitPrice: '0.10', quantity: 3 }], paymentMethod: 'DINHEIRO' };

test('precisão decimal e valores maiores que Number.MAX_SAFE_INTEGER', () => {
  assert.equal(calculate(base).final, '0.30');
  assert.equal(decimal(cents('9007199254740993.99')), '9007199254740993.99');
  assert.equal(decimal(cents('-0.01')), '-0.01');
});
test('rejeita representações monetárias ambíguas e quantidades inválidas', () => {
  for (const value of ['1e3', 'NaN', '1,20', '0.001', '', ' 1']) assert.throws(() => cents(value));
  for (const quantity of [0, -1, 1.2, NaN, Infinity, 2147483648]) {
    assert.throws(() => calculate({ ...base, items: [{ unitPrice: '1', quantity }] }));
  }
});
test('desconto menor que subtotal, troco e recebimento insuficiente como no Java', () => {
  assert.deepEqual(calculate({ ...base, discount: '0.05', received: '1' }), {
    total: '0.30', discount: '0.05', final: '0.25', received: '1.00', change: '0.75',
  });
  assert.equal(calculate({ ...base, received: '0.1' }).change, '0.00');
  for (const discount of ['-0.01', '0.30', '0.31']) assert.throws(() => calculate({ ...base, discount }));
});
test('pagamento dividido exige métodos diferentes e valor estritamente entre zero e total final', () => {
  assert.doesNotThrow(() => calculate({ ...base, secondPaymentMethod: 'PIX', secondPaymentAmount: '0.10' }));
  for (const secondPaymentAmount of ['0', '-1', '0.30', '1']) {
    assert.throws(() => calculate({ ...base, secondPaymentMethod: 'PIX', secondPaymentAmount }));
  }
  assert.throws(() => calculate({ ...base, secondPaymentMethod: 'DINHEIRO', secondPaymentAmount: '0.10' }));
  assert.throws(() => calculate({ ...base, secondPaymentAmount: '0.10' }));
});
test('preserva regra peculiar do troco misto do Java sem alterar comportamento silenciosamente', () => {
  assert.equal(calculate({ ...base, paymentMethod: 'PIX', secondPaymentMethod: 'DINHEIRO', secondPaymentAmount: '0.10', received: '0.25' }).change, '0.00');
});
test('venda vazia, gratuita e preço negativo são recusados', () => {
  assert.throws(() => calculate({ ...base, items: [] }));
  for (const unitPrice of ['0', '-1']) assert.throws(() => calculate({ ...base, items: [{ unitPrice, quantity: 1 }] }));
});
