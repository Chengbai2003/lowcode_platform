import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import {
  createUpdateSchemaCommand,
  createAddComponentCommand,
  createDeleteComponentCommand,
  createUpdatePropsCommand,
  createMacroCommand,
} from "../schemaCommands";
import type { A2UISchema } from "@lowcode-platform/types";
import type { Command } from "../../store/history";

// Mock schema for testing
const createMockSchema = (): A2UISchema => ({
  rootId: "root",
  components: {
    root: {
      id: "root",
      type: "Page",
      props: {},
      childrenIds: ["child1"],
    },
    child1: {
      id: "child1",
      type: "Button",
      props: { text: "Click me" },
      childrenIds: [],
    },
  },
});

describe("UpdateSchemaCommand", () => {
  let mockOnChange: ReturnType<typeof vi.fn>;
  let oldSchema: A2UISchema;
  let newSchema: A2UISchema;

  beforeEach(() => {
    mockOnChange = vi.fn();
    oldSchema = createMockSchema();
    newSchema = {
      ...oldSchema,
      components: {
        ...oldSchema.components,
        child1: {
          ...oldSchema.components.child1,
          props: { text: "Updated text" },
        },
      },
    };
  });

  it("should create command with correct properties", () => {
    const command = createUpdateSchemaCommand(
      oldSchema,
      newSchema,
      mockOnChange,
    );

    expect(command.description).toBe("更新 Schema");
    expect(command.id).toBeDefined();
    expect(command.timestamp).toBeGreaterThan(0);
  });

  it("should execute and call onChange with new schema", () => {
    const command = createUpdateSchemaCommand(
      oldSchema,
      newSchema,
      mockOnChange,
    );

    command.execute();

    expect(mockOnChange).toHaveBeenCalledWith(newSchema);
  });

  it("should undo and call onChange with old schema", () => {
    const command = createUpdateSchemaCommand(
      oldSchema,
      newSchema,
      mockOnChange,
    );

    command.undo();

    expect(mockOnChange).toHaveBeenCalledWith(oldSchema);
  });

  it("should redo and call onChange with new schema", () => {
    const command = createUpdateSchemaCommand(
      oldSchema,
      newSchema,
      mockOnChange,
    );

    command.redo();

    expect(mockOnChange).toHaveBeenCalledWith(newSchema);
  });

  it("should use custom description", () => {
    const command = createUpdateSchemaCommand(
      oldSchema,
      newSchema,
      mockOnChange,
      "Custom description",
    );

    expect(command.description).toBe("Custom description");
  });
});

describe("ComponentCommand", () => {
  let mockGetSchema: Mock<[], A2UISchema>;
  let mockSetSchema: Mock<[A2UISchema], void>;
  let schema: A2UISchema;

  beforeEach(() => {
    schema = createMockSchema();
    mockGetSchema = vi.fn(() => schema);
    mockSetSchema = vi.fn((newSchema: A2UISchema) => {
      schema = newSchema;
    });
  });

  describe("add operation", () => {
    it("should add component to schema", () => {
      const newComponent = {
        id: "newChild",
        type: "Input",
        props: { placeholder: "Enter text" },
        childrenIds: [],
      };

      const command = createAddComponentCommand(
        newComponent,
        "root",
        mockGetSchema,
        mockSetSchema,
      );

      command.execute();

      expect(mockSetSchema).toHaveBeenCalled();
      const updatedSchema = mockSetSchema.mock.calls[0][0];
      expect(updatedSchema.components.newChild).toBeDefined();
      expect(updatedSchema.components.root.childrenIds).toContain("newChild");
    });

    it("should undo add operation", () => {
      const newComponent = {
        id: "newChild",
        type: "Input",
        props: { placeholder: "Enter text" },
        childrenIds: [],
      };

      const command = createAddComponentCommand(
        newComponent,
        "root",
        mockGetSchema,
        mockSetSchema,
      );

      command.execute();
      mockGetSchema.mockReturnValue(schema);
      command.undo();

      const updatedSchema = mockSetSchema.mock.calls[1][0];
      expect(updatedSchema.components.newChild).toBeUndefined();
      expect(updatedSchema.components.root.childrenIds).not.toContain(
        "newChild",
      );
    });
  });

  describe("delete operation", () => {
    it("should delete component from schema", () => {
      const command = createDeleteComponentCommand(
        "child1",
        schema.components.child1,
        "root",
        0,
        mockGetSchema,
        mockSetSchema,
      );

      command.execute();

      expect(mockSetSchema).toHaveBeenCalled();
      const updatedSchema = mockSetSchema.mock.calls[0][0];
      expect(updatedSchema.components.child1).toBeUndefined();
      expect(updatedSchema.components.root.childrenIds).not.toContain("child1");
    });

    it("should undo delete operation", () => {
      const command = createDeleteComponentCommand(
        "child1",
        schema.components.child1,
        "root",
        0,
        mockGetSchema,
        mockSetSchema,
      );

      command.execute();
      mockGetSchema.mockReturnValue(schema);
      command.undo();

      const updatedSchema = mockSetSchema.mock.calls[1][0];
      expect(updatedSchema.components.child1).toBeDefined();
      expect(updatedSchema.components.root.childrenIds).toContain("child1");
    });
  });

  describe("update operation", () => {
    it("should update component props", () => {
      const command = createUpdatePropsCommand(
        "child1",
        { text: "Click me" },
        { text: "New text", disabled: true },
        mockGetSchema,
        mockSetSchema,
      );

      command.execute();

      expect(mockSetSchema).toHaveBeenCalled();
      const updatedSchema = mockSetSchema.mock.calls[0][0] as A2UISchema;
      expect(updatedSchema.components.child1?.props?.text).toBe("New text");
      expect(updatedSchema.components.child1?.props?.disabled).toBe(true);
    });

    it("should undo update operation", () => {
      const command = createUpdatePropsCommand(
        "child1",
        { text: "Click me" },
        { text: "New text" },
        mockGetSchema,
        mockSetSchema,
      );

      command.execute();
      mockGetSchema.mockReturnValue(schema);
      command.undo();

      const updatedSchema = mockSetSchema.mock.calls[1][0] as A2UISchema;
      expect(updatedSchema.components.child1?.props?.text).toBe("Click me");
    });
  });
});

describe("MacroCommand", () => {
  it("should execute all commands in order", () => {
    const callOrder: string[] = [];
    const command1: Command = {
      id: "cmd1",
      timestamp: Date.now(),
      description: "Command 1",
      execute: vi.fn(() => {
        callOrder.push("execute1");
      }),
      undo: vi.fn(),
      redo: vi.fn(),
    };

    const command2: Command = {
      id: "cmd2",
      timestamp: Date.now(),
      description: "Command 2",
      execute: vi.fn(() => {
        callOrder.push("execute2");
      }),
      undo: vi.fn(),
      redo: vi.fn(),
    };

    const macro = createMacroCommand([command1, command2], "Batch operation");

    macro.execute();

    expect(command1.execute).toHaveBeenCalled();
    expect(command2.execute).toHaveBeenCalled();
    expect(callOrder).toEqual(["execute1", "execute2"]);
  });

  it("should undo all commands in reverse order", () => {
    const callOrder: string[] = [];
    const command1: Command = {
      id: "cmd1",
      timestamp: Date.now(),
      description: "Command 1",
      execute: vi.fn(),
      undo: vi.fn(() => {
        callOrder.push("undo1");
      }),
      redo: vi.fn(),
    };

    const command2: Command = {
      id: "cmd2",
      timestamp: Date.now(),
      description: "Command 2",
      execute: vi.fn(),
      undo: vi.fn(() => {
        callOrder.push("undo2");
      }),
      redo: vi.fn(),
    };

    const macro = createMacroCommand([command1, command2], "Batch operation");

    macro.undo();

    expect(command2.undo).toHaveBeenCalled();
    expect(command1.undo).toHaveBeenCalled();
    expect(callOrder).toEqual(["undo2", "undo1"]);
  });

  it("should redo all commands in order", () => {
    const callOrder: string[] = [];
    const command1: Command = {
      id: "cmd1",
      timestamp: Date.now(),
      description: "Command 1",
      execute: vi.fn(),
      undo: vi.fn(),
      redo: vi.fn(() => {
        callOrder.push("redo1");
      }),
    };

    const command2: Command = {
      id: "cmd2",
      timestamp: Date.now(),
      description: "Command 2",
      execute: vi.fn(),
      undo: vi.fn(),
      redo: vi.fn(() => {
        callOrder.push("redo2");
      }),
    };

    const macro = createMacroCommand([command1, command2], "Batch operation");

    macro.redo();

    expect(command1.redo).toHaveBeenCalled();
    expect(command2.redo).toHaveBeenCalled();
    expect(callOrder).toEqual(["redo1", "redo2"]);
  });
});
