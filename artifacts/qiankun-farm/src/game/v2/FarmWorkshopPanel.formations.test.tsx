// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { FarmWorkshopPanel } from './FarmWorkshopPanel';
import type { WorkshopWarehouse } from './workshopRuntime';

afterEach(() => cleanup());

function warehouse(
  formations: { id: string; expiresAt: number | null }[] = [],
  activeFormation: string | null = null,
): WorkshopWarehouse {
  return {
    seeds: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
    crops: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
    workshop: {
      pots: [],
      decor: [],
      potGallery: {},
      decorGallery: {},
      materials: { 蘊靈砂: 0, 九霄玉髓: 0 },
      petFood: 0,
      formations,
      activeFormation,
    },
  };
}

function catalog() {
  return within(screen.getByRole('list', { name: '玄天陣典靈陣' }));
}

describe('玄天陣典 formation storefront', () => {
  it('shows the three formations with prices and the four benefits', () => {
    render(<FarmWorkshopPanel tab="護陣" warehouse={warehouse()} busy={false} transact={vi.fn(async () => true)} />);
    expect(catalog().getAllByRole('listitem')).toHaveLength(3);
    expect(catalog().getByText('玄靈聚元大陣')).toBeTruthy();
    expect(catalog().getByText('九霄造化大陣')).toBeTruthy();
    expect(catalog().getByText('太虛星河大陣')).toBeTruthy();
    expect(catalog().getByText('永久持有・188 水晶')).toBeTruthy();
    expect(catalog().getByText('永久持有・288 水晶')).toBeTruthy();
    expect(catalog().getByText('永久持有・388 水晶')).toBeTruthy();
    expect(catalog().getByText('生長 +8%・收成 +6%・金幣 +6%・靈寵 +8%')).toBeTruthy();
    expect(catalog().getByText('生長 +12%・收成 +9%・金幣 +9%・靈寵 +12%')).toBeTruthy();
    expect(catalog().getByText('生長 +20%・收成 +15%・金幣 +15%・靈寵 +20%')).toBeTruthy();
  });

  it('buys the 188 tier through the confirmation dialog', () => {
    const transact = vi.fn(async () => true);
    render(<FarmWorkshopPanel tab="護陣" warehouse={warehouse()} busy={false} transact={transact} />);
    fireEvent.click(catalog().getByRole('button', { name: '購買 188 水晶' }));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText('購買價格：188 水晶')).toBeTruthy();
    expect(transact).not.toHaveBeenCalled();
    fireEvent.click(dialog.getByRole('button', { name: '確認購買' }));
    expect(transact).toHaveBeenCalledWith({
      kind: 'purchaseFormation',
      formationId: 'FORMATION_XUANLING_188',
    });
  });

  it('offers an upgrade for the price difference once a lower tier is owned', () => {
    const transact = vi.fn(async () => true);
    render(
      <FarmWorkshopPanel
        tab="護陣"
        warehouse={warehouse([{ id: 'FORMATION_XUANLING_188', expiresAt: null }], 'FORMATION_XUANLING_188')}
        busy={false}
        transact={transact}
      />,
    );
    expect(catalog().queryByRole('button', { name: '購買 188 水晶' })).toBeNull();
    fireEvent.click(catalog().getByRole('button', { name: '升級補差額 100 水晶' }));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText('升級補差額：100 水晶（原價 288 水晶）')).toBeTruthy();
    fireEvent.click(dialog.getByRole('button', { name: '確認購買' }));
    expect(transact).toHaveBeenCalledWith({
      kind: 'purchaseFormation',
      formationId: 'FORMATION_JIUXIAO_288',
    });
  });

  it('does not offer a lower tier once the 388 formation is owned', () => {
    render(
      <FarmWorkshopPanel
        tab="護陣"
        warehouse={warehouse([{ id: 'FORMATION_PREMIUM_V2', expiresAt: null }], 'FORMATION_PREMIUM_V2')}
        busy={false}
        transact={vi.fn(async () => true)}
      />,
    );
    expect(catalog().getAllByText('已持有更高階靈陣，無需購買')).toHaveLength(2);
    expect(catalog().queryByRole('button', { name: /購買/ })).toBeNull();
    expect(catalog().getByText('運作中')).toBeTruthy();
  });

  it('marks an owned but unequipped tier and keeps switching in the owned list', () => {
    const transact = vi.fn(async () => true);
    render(
      <FarmWorkshopPanel
        tab="護陣"
        warehouse={warehouse([{ id: 'FORMATION_JIUXIAO_288', expiresAt: null }])}
        busy={false}
        transact={transact}
      />,
    );
    expect(catalog().getByText('已持有（於下方裝備）')).toBeTruthy();
    const owned = within(screen.getByRole('list', { name: '持有護陣道具' }));
    fireEvent.click(owned.getByRole('button', { name: '裝備' }));
    expect(transact).toHaveBeenCalledWith({
      kind: 'switchFormation',
      formationId: 'FORMATION_JIUXIAO_288',
    });
  });
});
