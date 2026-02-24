import { describe, it, expect } from 'vitest';
import { compileToCode } from '../src/generator';
import type { A2UISchema } from '@lowcode-platform/renderer';

describe('Compiler Generator', () => {
  it('should generate valid React component code with antd default', () => {
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
    expect(code).toContain("import { Container, Text, message } from 'antd';");
    expect(code).toContain('export default function GeneratedPage()');
    expect(code).toContain('className="p-[20px]"');
    expect(code).toContain('content="Hello World"');
  });

  it('should correctly configure component sources and group imports', () => {
    const schema: A2UISchema = {
      rootId: 'root',
      components: {
        root: {
          id: 'root',
          type: 'Page',
          childrenIds: ['btn']
        },
        btn: {
          id: 'btn',
          type: 'MyButton',
        }
      }
    };

    const code = compileToCode(schema, {
      componentSources: {
        Page: '@my-ui/layout',
        MyButton: '@my-ui/button',
      },
      defaultLibrary: '@default/lib'
    });

    expect(code).toContain("import { Page } from '@my-ui/layout';");
    expect(code).toContain("import { MyButton } from '@my-ui/button';");
    expect(code).toContain("import { message } from '@default/lib';");
  });

  it('should collect state correctly and serialize expression nodes', () => {
    // using raw object without __expr wrapper just as how renderer sets it initially before generator transforms it internally
    const schema: A2UISchema = {
      rootId: 'root',
      components: {
        root: {
          id: 'root',
          type: 'Input',
          props: {
            field: 'formData.name',
            value: 'will_be_overridden',
            onChange: 'will_be_overridden'
          }
        }
      }
    };

    const code = compileToCode(schema);
    expect(code).toContain("const [formDataName, setFormDataName] = useState");
    expect(code).toContain('value={formDataName}');
    expect(code).toContain('onChange={(e) => setFormDataName(e.target ? e.target.value : e)}');
  });

  it('should escape XSS payloads in labels and text children', () => {
    const schema: A2UISchema = {
      rootId: 'root',
      components: {
        root: {
          id: 'root',
          type: 'Input',
          props: {
            label: '<script>alert(1)</script>',
            children: 'Text "quotes" & {braces}'
          }
        }
      }
    };

    const code = compileToCode(schema);
    expect(code).toContain('&gt;</label>');
    expect(code).not.toContain('<script>');
    expect(code).toContain('Text &quot;quotes&quot; &amp; &#123;braces&#125;');
  });

  it('should generate empty string safely without rootId', () => {
    const schema: A2UISchema = {
      rootId: '',
      components: {}
    };
    const code = compileToCode(schema);
    expect(code).toContain('return (\n\n  );'); // empty return
  });

  it('should show Not Found for missing nodes', () => {
    const schema: A2UISchema = {
      rootId: 'root',
      components: {
        root: {
          id: 'root',
          type: 'Box',
          childrenIds: ['missing']
        }
      }
    };
    const code = compileToCode(schema);
    expect(code).toContain('Node missing Not Found');
  });

  it('should not infinite stack overflow on circular references', () => {
    const schema: A2UISchema = {
      rootId: 'nodeA',
      components: {
        nodeA: {
          id: 'nodeA',
          type: 'NodeA',
          childrenIds: ['nodeB']
        },
        nodeB: {
          id: 'nodeB',
          type: 'NodeB',
          childrenIds: ['nodeA'] // Circular!
        }
      }
    };
    const code = compileToCode(schema);
    expect(code).toContain('{/* Circular ref: nodeA */}');
  });

  it('should map submit events correctly', () => {
    const schema: A2UISchema = {
      rootId: 'btn',
      components: {
        btn: {
          id: 'btn',
          type: 'Button',
          events: {
            onClick: [{ type: 'customAction', plugin: 'submit', config: {} }]
          }
        }
      }
    };
    const code = compileToCode(schema);
    expect(code).toContain('onClick={() => {\n      console.log("Submit", {  });\n      message.success("提交成功");\n    }}');
  });
});
