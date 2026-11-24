import test from 'node:test';
import assert from 'node:assert/strict';
import { forecastOverlay, axisLabels, turnOrder, forecastLookahead } from './board-view.mjs';

test('corner pounce and alternate-seat order remain correct with no engine overlay', () => {
  const icon = name => `[${name}]`;
  const pounce = { round: 2, type: 'pounce', row: 0, col: 0 };
  const swipe = { round: 3, type: 'swipe', axis: 'column', index: 2, direction: -1 };
  const game = { version: 3, round: 2, firstPlayer: 'lydia', activePlayer: 'jon', turnInRound: 0, forecast: pounce };
  const overlay = forecastOverlay(game, [], icon);
  const cells = [...overlay.matchAll(/class="pounce-target-cell ([^"]*)" style="left:(\d+)%;top:(\d+)%"/g)]
    .map(([, cue, left, top]) => [Number(left), Number(top), cue]);
  assert.deepEqual(cells.sort(), [[0, 0, 'pounce-center'], [0, 20, ''], [20, 0, '']]); // A1, A2, B1
  assert.equal(overlay.split('[paw]').length - 1, 1);
  assert.match(turnOrder(game, icon), /round-order-seat jon current" aria-current="step".*round-order-seat lydia"/);
  assert.match(turnOrder({ ...game, version: 2, activePlayer: 'lydia' }, icon),
    /round-order-seat lydia current" aria-current="step".*round-order-seat jon"/);

  const upcoming = [pounce, swipe, { type: 'nap', round: 4 }];
  assert.match(forecastLookahead(game, upcoming, icon), /\[up\] Column C · up/);
  const swipeGame = { ...game, forecast: swipe };
  assert.match(forecastOverlay(swipeGame, [], icon), /forecast-lane column direction-up/);
  const labels = axisLabels(swipeGame, 'row') + axisLabels(swipeGame, 'column');
  assert.deepEqual([...labels.matchAll(/board-axis-label targeted">([^<]+)/g)].map(match => match[1]), ['C']);
  const finished = { ...swipeGame, phase: 'finished' };
  assert.equal(forecastOverlay(finished, [], icon), '');
  assert.equal(forecastLookahead(finished, upcoming, icon), '');
});
