import { describe, it, expect, beforeEach } from "vitest";
import { useHistoryStore, createCommandOptions } from "../history";
import type { Command } from "../history";

// Mock command for testing
class MockCommand implements Command {
  id: string;
  timestamp: number;
  description: string;
  executeCount = 0;
  undoCount = 0;
  redoCount = 0;

  constructor(description: string = "Mock command") {
    const options = createCommandOptions(description);
    this.id = options.id;
    this.timestamp = options.timestamp;
    this.description = options.description;
  }

  execute() {
    this.executeCount++;
  }

  undo() {
    this.undoCount++;
  }

  redo() {
    this.redoCount++;
  }
}

describe("HistoryStore", () => {
  beforeEach(() => {
    // Reset store before each test
    useHistoryStore.getState().clear();
  });

  describe("executeCommand", () => {
    it("should execute command and add to undo stack", () => {
      const command = new MockCommand("Test command");
      useHistoryStore.getState().executeCommand(command);

      expect(command.executeCount).toBe(1);
      expect(useHistoryStore.getState().undoStack.length).toBe(1);
      expect(useHistoryStore.getState().redoStack.length).toBe(0);
    });

    it("should clear redo stack when executing new command", () => {
      const command1 = new MockCommand("Command 1");
      const command2 = new MockCommand("Command 2");

      useHistoryStore.getState().executeCommand(command1);
      useHistoryStore.getState().undo();
      expect(useHistoryStore.getState().redoStack.length).toBe(1);

      useHistoryStore.getState().executeCommand(command2);
      expect(useHistoryStore.getState().redoStack.length).toBe(0);
    });

    it("should limit history size to maxHistorySize", () => {
      const store = useHistoryStore.getState();

      // Execute more commands than maxHistorySize
      for (let i = 0; i < 60; i++) {
        const command = new MockCommand(`Command ${i}`);
        store.executeCommand(command);
      }

      expect(store.undoStack.length).toBeLessThanOrEqual(50);
    });
  });

  describe("undo", () => {
    it("should undo last command", () => {
      const command = new MockCommand("Test command");
      useHistoryStore.getState().executeCommand(command);

      const undoneCommand = useHistoryStore.getState().undo();

      expect(command.undoCount).toBe(1);
      expect(undoneCommand).toBe(command);
      expect(useHistoryStore.getState().undoStack.length).toBe(0);
      expect(useHistoryStore.getState().redoStack.length).toBe(1);
    });

    it("should return null when no commands to undo", () => {
      const result = useHistoryStore.getState().undo();
      expect(result).toBeNull();
    });
  });

  describe("redo", () => {
    it("should redo last undone command", () => {
      const command = new MockCommand("Test command");
      useHistoryStore.getState().executeCommand(command);
      useHistoryStore.getState().undo();

      const redoneCommand = useHistoryStore.getState().redo();

      expect(command.redoCount).toBe(1);
      expect(redoneCommand).toBe(command);
      expect(useHistoryStore.getState().undoStack.length).toBe(1);
      expect(useHistoryStore.getState().redoStack.length).toBe(0);
    });

    it("should return null when no commands to redo", () => {
      const result = useHistoryStore.getState().redo();
      expect(result).toBeNull();
    });
  });

  describe("canUndo/canRedo", () => {
    it("should return correct undo availability", () => {
      expect(useHistoryStore.getState().canUndo()).toBe(false);

      const command = new MockCommand();
      useHistoryStore.getState().executeCommand(command);

      expect(useHistoryStore.getState().canUndo()).toBe(true);
    });

    it("should return correct redo availability", () => {
      expect(useHistoryStore.getState().canRedo()).toBe(false);

      const command = new MockCommand();
      useHistoryStore.getState().executeCommand(command);
      useHistoryStore.getState().undo();

      expect(useHistoryStore.getState().canRedo()).toBe(true);
    });
  });

  describe("clear", () => {
    it("should clear all history", () => {
      const command1 = new MockCommand("Command 1");
      const command2 = new MockCommand("Command 2");

      useHistoryStore.getState().executeCommand(command1);
      useHistoryStore.getState().executeCommand(command2);
      useHistoryStore.getState().undo();

      useHistoryStore.getState().clear();

      expect(useHistoryStore.getState().undoStack.length).toBe(0);
      expect(useHistoryStore.getState().redoStack.length).toBe(0);
    });
  });

  describe("getUndoHistory/getRedoHistory", () => {
    it("should return undo history descriptions", () => {
      const command1 = new MockCommand("First");
      const command2 = new MockCommand("Second");

      useHistoryStore.getState().executeCommand(command1);
      useHistoryStore.getState().executeCommand(command2);

      const history = useHistoryStore.getState().getUndoHistory();

      expect(history).toEqual(["Second", "First"]);
    });

    it("should limit history count", () => {
      for (let i = 0; i < 5; i++) {
        const command = new MockCommand(`Command ${i}`);
        useHistoryStore.getState().executeCommand(command);
      }

      const history = useHistoryStore.getState().getUndoHistory(3);

      expect(history.length).toBe(3);
    });
  });
});

describe("createCommandOptions", () => {
  it("should create options with generated id and timestamp", () => {
    const options = createCommandOptions("Test description");

    expect(options.description).toBe("Test description");
    expect(options.id).toBeDefined();
    expect(options.timestamp).toBeGreaterThan(0);
  });

  it("should use provided id", () => {
    const options = createCommandOptions("Test", "custom-id");

    expect(options.id).toBe("custom-id");
  });
});
