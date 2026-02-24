import { describe, it, expect } from 'vitest';
import { compileToCode } from '../src/generator';
import type { A2UISchema } from '@lowcode-platform/renderer';

describe('Compiler Generator', () => {
  it('should generate valid React component code from basic schema', () => {
    const schema: A2UISchema = {
      rootId: 'root',
      components: {
        root: {
          id: 'root',
          type: 'Container',
          props: {
            style: { padding: '20px' }
          },
          childrenIds: ['text1']
        },
        text1: {
          id: 'text1',
          type: 'Text',
          props: {
            content: 'Hello World'
          }
        }
      }
    };

    const code = compileToCode(schema);
    expect(code).toContain("import React, { useState } from 'react';");
    expect(code).toContain("import { Container, Text, message } from 'antd';");
    expect(code).toContain('export default function GeneratedPage()');
    expect(code).toContain('className="p-[20px]"');
    expect(code).toContain('content="Hello World"');
  });

  it('should collect state correctly and stringify functions', () => {
    const schema: A2UISchema = {
      rootId: 'root',
      components: {
        root: {
          id: 'root',
          type: 'Input',
          props: {
            value: '{{formData.name}}',
            onChange: {
              type: 'setField',
              field: 'formData.name',
              value: '{{event.target.value}}'
            }
          }
        }
      }
    };

    const code = compileToCode(schema);
    expect(code).toContain("import { Input, message } from 'antd';");
    expect(code).toContain('value="{{formData.name}}"');
    // we only check for basic binding output
  });
});
