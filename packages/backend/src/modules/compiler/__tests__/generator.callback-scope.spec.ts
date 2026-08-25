import type { A2UISchema } from '../schema.types';
import { compileSchemaToCode } from '../pipeline';

function makeSchema(components: A2UISchema['components']): A2UISchema {
  return {
    version: 1,
    rootId: 'page_root',
    components,
  };
}

function extractGeneratedHandlers(code: string): string {
  const functionStart = 'export default function GeneratedPage() {\n';
  const start = code.indexOf(functionStart);
  const end = code.lastIndexOf('\n  return ');
  if (start < 0 || end < 0) {
    throw new Error('GeneratedPage handler section not found');
  }
  return code
    .slice(start + functionStart.length, end)
    .replace(/^  /gm, '')
    .trim();
}

describe('compiler callback scope', () => {
  it.each(['Object', 'URLSearchParams', 'Promise', 'setTimeout'])(
    'rejects loop binding %s that would shadow a generated runtime dependency',
    (itemVar) => {
      const schema = makeSchema({
        page_root: { id: 'page_root', type: 'Page', childrenIds: ['btn'] },
        btn: {
          id: 'btn',
          type: 'Button',
          props: { children: 'load' },
          events: {
            onClick: [
              {
                type: 'loop',
                itemVar,
                over: [{ id: 'row-1' }],
                actions: [
                  {
                    type: 'apiCall',
                    url: '/api/outer',
                    onSuccess: [
                      {
                        type: 'apiCall',
                        url: '/api/inner',
                        params: { id: '{{ response.id }}' },
                      },
                    ],
                  },
                ],
              },
            ],
          },
          childrenIds: [],
        },
      });

      expect(() => compileSchemaToCode(schema)).toThrow(`非法循环变量标识符: "${itemVar}"`);
    },
  );

  it('captures loop locals in api callbacks and keeps request temporaries collision-safe', async () => {
    const schema = makeSchema({
      page_root: { id: 'page_root', type: 'Page', childrenIds: ['btn'] },
      btn: {
        id: 'btn',
        type: 'Button',
        props: { children: 'load' },
        events: {
          onClick: [
            {
              type: 'loop',
              itemVar: 'requestParams',
              over: [{ id: 'row-1', token: 'secret' }],
              actions: [
                {
                  type: 'apiCall',
                  url: '/api/items',
                  headers: { Authorization: '{{ requestParams.token }}' },
                  params: { id: '{{ requestParams.id }}' },
                  onSuccess: [{ type: 'log', value: '{{ requestParams.id }}' }],
                },
              ],
            },
          ],
        },
        childrenIds: [],
      },
    });
    const code = compileSchemaToCode(schema);

    expect(code).toContain('const handleBtnClickOnSuccess = (response, requestParams) =>');
    expect(code).toContain('.then((response) => handleBtnClickOnSuccess(response, requestParams))');
    expect(code).toContain('const __requestParams = { id: requestParams.id }');
    expect(code).toContain('headers: { Authorization: requestParams.token }');
    expect(code).not.toContain('const requestParams =');

    const requests: Array<{ url: string; config: Record<string, unknown> }> = [];
    const fetchMock = jest.fn((url: string, config: Record<string, unknown>) => {
      requests.push({ url, config });
      return Promise.resolve({ json: () => Promise.resolve({ ok: true }) });
    });
    const logs: string[] = [];
    const handlerFactory = new Function(
      'fetch',
      'console',
      `${extractGeneratedHandlers(code)}\nreturn handleBtnClick;`,
    );
    const handler = handlerFactory(fetchMock, { log: (value: string) => logs.push(value) });

    expect(() => handler()).not.toThrow();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(requests).toEqual([
      {
        url: '/api/items?id=row-1',
        config: { method: 'GET', headers: { Authorization: 'secret' } },
      },
    ]);
    expect(logs).toEqual(['row-1']);
  });

  it('captures loop locals in api error callbacks', async () => {
    const schema = makeSchema({
      page_root: { id: 'page_root', type: 'Page', childrenIds: ['btn'] },
      btn: {
        id: 'btn',
        type: 'Button',
        props: { children: 'load' },
        events: {
          onClick: [
            {
              type: 'loop',
              itemVar: 'item',
              over: [{ id: 'row-1' }],
              actions: [
                {
                  type: 'apiCall',
                  url: '/api/items',
                  onError: [{ type: 'log', value: '{{ item.id }}' }],
                },
              ],
            },
          ],
        },
        childrenIds: [],
      },
    });
    const code = compileSchemaToCode(schema);

    expect(code).toContain('const handleBtnClickOnError = (error, item) =>');
    expect(code).toContain('.catch((error) => handleBtnClickOnError(error, item))');

    const fetchMock = jest.fn(() => Promise.reject(new Error('network failed')));
    const logs: string[] = [];
    const handlerFactory = new Function(
      'fetch',
      'console',
      `${extractGeneratedHandlers(code)}\nreturn handleBtnClick;`,
    );
    const handler = handlerFactory(fetchMock, { log: (value: string) => logs.push(value) });

    expect(() => handler()).not.toThrow();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(logs).toEqual(['row-1']);
  });

  it('captures loop locals in detached dialog callbacks', () => {
    const schema = makeSchema({
      page_root: { id: 'page_root', type: 'Page', childrenIds: ['btn'] },
      btn: {
        id: 'btn',
        type: 'Button',
        props: { children: 'confirm' },
        events: {
          onClick: [
            {
              type: 'loop',
              itemVar: 'item',
              over: [{ id: 'row-1' }],
              actions: [
                {
                  type: 'dialog',
                  kind: 'confirm',
                  content: '{{ item.id }}',
                  onOk: [{ type: 'log', value: '{{ item.id }}' }],
                  onCancel: [{ type: 'log', value: '{{ item.id }}' }],
                },
              ],
            },
          ],
        },
        childrenIds: [],
      },
    });
    const code = compileSchemaToCode(schema);

    expect(code).toContain('const handleBtnClickOnOk = (item) =>');
    expect(code).toContain('onOk: () => handleBtnClickOnOk(item)');
    expect(code).toContain('const handleBtnClickOnCancel = (item) =>');
    expect(code).toContain('onCancel: () => handleBtnClickOnCancel(item)');

    let onOk: (() => void) | undefined;
    let onCancel: (() => void) | undefined;
    const Modal = {
      confirm: (config: { onOk?: () => void; onCancel?: () => void }) => {
        onOk = config.onOk;
        onCancel = config.onCancel;
      },
    };
    const logs: string[] = [];
    const handlerFactory = new Function(
      'Modal',
      'console',
      `${extractGeneratedHandlers(code)}\nreturn handleBtnClick;`,
    );
    const handler = handlerFactory(Modal, { log: (value: string) => logs.push(value) });

    expect(() => handler()).not.toThrow();
    expect(onOk).toBeDefined();
    expect(() => onOk?.()).not.toThrow();
    expect(onCancel).toBeDefined();
    expect(() => onCancel?.()).not.toThrow();
    expect(logs).toEqual(['row-1', 'row-1']);
  });
});
