import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFloatingIslandHotkey } from '../useFloatingIslandHotkey';
import { useEditorStore } from '../../store/editor-store';

describe('useFloatingIslandHotkey', () => {
  beforeEach(() => {
    // Reset store state
    useEditorStore.setState({
      isFloatingIslandOpen: false,
      isHistoryDrawerOpen: false,
    });
  });

  it('should toggle floating island on Cmd+K', () => {
    renderHook(() => useFloatingIslandHotkey());

    const event = new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: true,
    });

    act(() => {
      window.dispatchEvent(event);
    });

    expect(useEditorStore.getState().isFloatingIslandOpen).toBe(true);
  });

  it('should toggle floating island on Ctrl+K', () => {
    renderHook(() => useFloatingIslandHotkey());

    const event = new KeyboardEvent('keydown', {
      key: 'k',
      ctrlKey: true,
    });

    act(() => {
      window.dispatchEvent(event);
    });

    expect(useEditorStore.getState().isFloatingIslandOpen).toBe(true);
  });

  it('should close floating island on Escape', () => {
    useEditorStore.getState().setFloatingIslandOpen(true);

    renderHook(() => useFloatingIslandHotkey());

    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
    });

    act(() => {
      window.dispatchEvent(event);
    });

    expect(useEditorStore.getState().isFloatingIslandOpen).toBe(false);
  });

  it('should not close floating island on Escape when closed', () => {
    renderHook(() => useFloatingIslandHotkey());

    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
    });

    act(() => {
      window.dispatchEvent(event);
    });

    // Should remain closed
    expect(useEditorStore.getState().isFloatingIslandOpen).toBe(false);
  });

  it('should toggle history drawer on Alt+H', () => {
    renderHook(() => useFloatingIslandHotkey());

    const event = new KeyboardEvent('keydown', {
      key: 'h',
      altKey: true,
    });

    act(() => {
      window.dispatchEvent(event);
    });

    expect(useEditorStore.getState().isHistoryDrawerOpen).toBe(true);
  });

  it('should return state and actions', () => {
    const { result } = renderHook(() => useFloatingIslandHotkey());

    expect(result.current.isFloatingIslandOpen).toBe(false);
    expect(typeof result.current.toggleFloatingIsland).toBe('function');
    expect(typeof result.current.setFloatingIslandOpen).toBe('function');
  });
});
