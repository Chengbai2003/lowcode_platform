import { BadRequestException } from '@nestjs/common';
import { antdManifest, antdCompilerBindings } from '@lowcode-platform/preset-antd';
import { testManifest, testCompilerBindings } from '@lowcode-platform/preset-test';
import { CompilerService } from '../compiler.service';
import { compileToCode } from '../generator';
import { PageSchemaService } from '../../page-schema/page-schema.service';
import { DEPLOYMENT_RUNTIME_PROFILE_REGISTRY } from '../../runtime-profile/deployment-runtime-profile-registry';

describe('Compiler Props 安全过滤与 Manifest 可信来源（Constraint 1 & 2）', () => {
  describe('Static Emission 属性过滤', () => {
    it('全局阻断 dangerouslySetInnerHTML，即使无 Manifest 也不生成到 JSX', () => {
      const schema = {
        schemaVersion: 0,
        rootId: 'btn',
        components: {
          btn: {
            id: 'btn',
            type: 'Button',
            props: {
              children: '点击',
              dangerouslySetInnerHTML: { __html: '<script>alert(1)</script>' },
            },
            childrenIds: [],
          },
        },
      };

      const code = compileToCode(schema);
      expect(code).not.toContain('dangerouslySetInnerHTML');
      expect(code).toContain('>点击</Button>');
    });

    it('AntD 路径：依据 antdManifest 允许合法 props，丢弃未知 props，保留 events 生成的 onClick', () => {
      const schema = {
        schemaVersion: 0,
        rootId: 'root',
        components: {
          root: {
            id: 'root',
            type: 'Button',
            props: {
              children: 'AntD 按钮',
              type: 'primary',
              loading: true,
              danger: true,
              onerror: 'alert(1)',
              unknownProp: 'evil',
              dangerouslySetInnerHTML: { __html: 'bad' },
            },
            events: {
              onClick: [{ type: 'log', value: 'antd clicked' }],
            },
            childrenIds: [],
          },
        },
      };

      const code = compileToCode(schema, {
        ...antdCompilerBindings,
        manifest: antdManifest,
      });

      // 合法 AntD props 保留
      expect(code).toContain('type="primary"');
      expect(code).toContain('loading={true}');
      expect(code).toContain('danger={true}');
      expect(code).toContain('>AntD 按钮</Button>');

      // 非法 / 未知属性被剔除
      expect(code).not.toContain('onerror');
      expect(code).not.toContain('unknownProp');
      expect(code).not.toContain('dangerouslySetInnerHTML');

      // 合法 events 生成的 onClick 函数被保留且未被误杀
      expect(code).toMatch(/onClick=\{handleRootClick\}/);
      expect(code).toContain('const handleRootClick = () => {');
      expect(code).toContain('console.log("antd clicked");');
    });

    it('Test 路径：依据 testManifest 拒绝 AntD 专属 props（loading/danger）与未知 props，保留合法 props 与 events', () => {
      const schema = {
        schemaVersion: 0,
        rootId: 'root',
        components: {
          root: {
            id: 'root',
            type: 'Button',
            props: {
              children: 'Test 按钮',
              variant: 'solid',
              disabled: true,
              loading: true, // AntD 专属，Test 不支持
              danger: true, // AntD 专属，Test 不支持
              onerror: 'alert(1)',
              dangerouslySetInnerHTML: { __html: 'bad' },
            },
            events: {
              onClick: [{ type: 'log', value: 'test clicked' }],
            },
            childrenIds: [],
          },
        },
      };

      const code = compileToCode(schema, {
        ...testCompilerBindings,
        manifest: testManifest,
      });

      // 合法 Test props 保留
      expect(code).toContain('variant="solid"');
      expect(code).toContain('disabled={true}');
      expect(code).toContain('>Test 按钮</Button>');

      // AntD 专属及危险未知 props 必须被剔除
      expect(code).not.toContain('loading');
      expect(code).not.toContain('danger=');
      expect(code).not.toContain('onerror');
      expect(code).not.toContain('dangerouslySetInnerHTML');

      // 合法 events 生成的 onClick 函数被保留
      expect(code).toMatch(/onClick=\{handleRootClick\}/);
      expect(code).toContain('const handleRootClick = () => {');
      expect(code).toContain('console.log("test clicked");');
    });

    it('基础 DOM 路径（Div/Span）：保留 id/className/style 等合法公共属性与 events，丢弃未知危险属性', () => {
      const schema = {
        schemaVersion: 0,
        rootId: 'div1',
        components: {
          div1: {
            id: 'div1',
            type: 'Div',
            props: {
              id: 'my-div',
              className: 'custom-wrapper',
              title: 'tooltip',
              onerror: 'alert(1)',
              customBadProp: 'payload',
              dangerouslySetInnerHTML: { __html: '<p>bad</p>' },
            },
            events: {
              onClick: [{ type: 'log', value: 'div clicked' }],
            },
            childrenIds: [],
          },
        },
      };

      const code = compileToCode(schema, {
        ...antdCompilerBindings,
        manifest: antdManifest,
      });

      expect(code).toContain('id="my-div"');
      expect(code).toContain('className="custom-wrapper"');
      expect(code).toContain('title="tooltip"');
      expect(code).not.toContain('onerror');
      expect(code).not.toContain('customBadProp');
      expect(code).not.toContain('dangerouslySetInnerHTML');

      // events 生成的 onClick 绝不丢失
      expect(code).toMatch(/onClick=\{handleDiv1Click\}/);
      expect(code).toContain('const handleDiv1Click = () => {');
    });
  });

  describe('CompilerService 可信 Manifest 来源与 fail-close', () => {
    let compilerService: CompilerService;
    let mockPageSchemaService: Partial<PageSchemaService>;

    beforeEach(() => {
      mockPageSchemaService = {
        getSchema: jest.fn(),
      };
      compilerService = new CompilerService(
        mockPageSchemaService as PageSchemaService,
        DEPLOYMENT_RUNTIME_PROFILE_REGISTRY,
      );
    });

    it('根据 page.runtimeCompatibility 服务端可信解析对应 Preset Manifest', async () => {
      const schema = {
        schemaVersion: 0,
        rootId: 'btn',
        components: {
          btn: {
            id: 'btn',
            type: 'Button',
            props: {
              children: '按钮',
              loading: true,
              variant: 'solid',
              onerror: 'alert(1)',
            },
            childrenIds: [],
          },
        },
      };

      // 场景 1：页面绑定 builtin-test@0.1.0
      (mockPageSchemaService.getSchema as jest.Mock).mockResolvedValueOnce({
        runtimeCompatibility: {
          componentPresetId: 'builtin-test',
          componentPresetVersion: '0.1.0',
          rendererVersion: '1.0.0',
        },
      });

      const resTest = await compilerService.compile({
        schema,
        options: { pageId: 'test-page', pageVersion: 1 },
      });

      // 在 test preset 下，loading 和 onerror 必须被过滤，variant 必须保留
      expect(resTest.code).not.toContain('loading');
      expect(resTest.code).not.toContain('onerror');
      expect(resTest.code).toContain('variant="solid"');

      // 场景 2：页面绑定 builtin-antd@0.1.0
      (mockPageSchemaService.getSchema as jest.Mock).mockResolvedValueOnce({
        runtimeCompatibility: {
          componentPresetId: 'builtin-antd',
          componentPresetVersion: '0.1.0',
          rendererVersion: '1.0.0',
        },
      });

      const resAntd = await compilerService.compile({
        schema,
        options: { pageId: 'antd-page', pageVersion: 1 },
      });

      // 在 antd preset 下，loading 保留，onerror 和 variant 被过滤
      expect(resAntd.code).toContain('loading={true}');
      expect(resAntd.code).not.toContain('onerror');
      expect(resAntd.code).not.toContain('variant="solid"');
    });

    it('未知 Preset 必须 fail-close 拒绝，禁止隐式回退到 AntD', async () => {
      (mockPageSchemaService.getSchema as jest.Mock).mockResolvedValueOnce({
        runtimeCompatibility: {
          componentPresetId: 'malicious-or-unknown-preset',
          componentPresetVersion: '9.9.9',
          rendererVersion: '1.0.0',
        },
      });

      await expect(
        compilerService.compile({
          schema: {
            schemaVersion: 0,
            rootId: 'btn',
            components: {
              btn: { id: 'btn', type: 'Button', props: { children: 'x' }, childrenIds: [] },
            },
          },
          options: { pageId: 'unknown-page', pageVersion: 1 },
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
