import { describe, it, expect } from "vitest";
import {
  safeValidateSchema,
  validateSchemaWithWhitelist,
} from "../src/utils/schema-validator";
import type { A2UISchema } from "@lowcode-platform/types";

describe("schema-validator", () => {
  const validSchema: A2UISchema = {
    version: 1,
    rootId: "root",
    components: {
      root: { id: "root", type: "Container", childrenIds: ["btn1"] },
      btn1: { id: "btn1", type: "Button", props: { text: "Click Me" } },
    },
  };

  describe("safeValidateSchema", () => {
    it("should validate a correct schema", () => {
      const result = safeValidateSchema(validSchema);
      expect(result.success).toBe(true);
    });

    it("should fail on missing rootId", () => {
      const invalid = { ...validSchema, rootId: undefined };
      const result = safeValidateSchema(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe("validateSchemaWithWhitelist", () => {
    const whitelist = ["Container", "Button", "Input"];

    it("should pass when all components are in whitelist", () => {
      const result = validateSchemaWithWhitelist(validSchema, whitelist);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.rootId).toBe("root");
      }
    });

    it("should fail when a component is not in whitelist", () => {
      const invalidSchema: A2UISchema = {
        ...validSchema,
        components: {
          ...validSchema.components,
          hacker: { id: "hacker", type: "UnknownWidget" },
        },
      };
      const result = validateSchemaWithWhitelist(invalidSchema, whitelist);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain(
          "未注册的组件类型: hacker → UnknownWidget",
        );
      }
    });
  });
});
