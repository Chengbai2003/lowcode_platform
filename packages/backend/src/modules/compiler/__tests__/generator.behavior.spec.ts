import { compileToCode, formatCode } from '../generator';
import { behaviorSchemas, snapshotSchemas } from './compilerTestSchemas';

async function compileFormatted(schema: unknown) {
  return formatCode(compileToCode(schema as Record<string, any>));
}

describe('compiler generator behavior', () => {
  it('supports {{ }} expressions and template strings', async () => {
    const code = await compileFormatted(behaviorSchemas.expressionsAndTemplates);

    expect(code).toContain('{"你好，" + name}');
    expect(code).toContain('{`欢迎 ${name}，再次欢迎 ${name}`}');
    expect(code).toContain('href={`/users/${name}`}');
  });

  it('lowers visible props into conditional rendering', async () => {
    const code = await compileFormatted(behaviorSchemas.visibleConditions);

    expect(code).toContain('{enabled ? <Card>条件面板</Card> : null}');
    expect(code).not.toContain('visible={false}');
    expect(code).not.toContain('visible={enabled}');
  });

  it('merges compiled style classes without duplicating className', async () => {
    const code = await compileFormatted(snapshotSchemas.styleClassMerge);

    expect(code).toContain('<Div className="banner-shell mb-[16] flex text-[#1f2937]">系统公告</Div>');
    expect(code).not.toContain('className="banner-shell" className=');
  });

  it('extracts component events and dialog callbacks into named handlers', async () => {
    const code = await compileFormatted(behaviorSchemas.notificationAndDialog);

    expect(code).toContain('const handleBtnUiClick = () => {');
    expect(code).toContain('const handleBtnUiClickOnOk = () => {');
    expect(code).toContain('const handleBtnUiClickOnCancel = () => {');
    expect(code).toContain('onClick={handleBtnUiClick}');
    expect(code).toContain('import { Button, Modal, Page, message, notification } from "antd";');
    expect(code).toContain('notification.success({');
    expect(code).toContain('placement: "bottomRight"');
    expect(code).toContain('Modal.confirm({');
    expect(code).toContain('onOk: handleBtnUiClickOnOk');
    expect(code).toContain('onCancel: handleBtnUiClickOnCancel');
  });

  it('keeps async named handlers for api callbacks when delay is used', async () => {
    const code = await compileFormatted(behaviorSchemas.actionCallbacksAndDelay);

    expect(code).toContain('const [hidden_rows, setHidden_rows] = useState([]);');
    expect(code).toContain('const handleBtnFetchClick = async () => {');
    expect(code).toContain('const handleBtnFetchClickOnSuccess = async (response) => {');
    expect(code).toContain('const handleBtnFetchClickOnError = (error) => {');
    expect(code).toContain('onClick={handleBtnFetchClick}');
    expect(code).toContain('.then(handleBtnFetchClickOnSuccess)');
    expect(code).toContain('.catch(handleBtnFetchClickOnError)');
    expect(code).toContain('await new Promise((resolve) => setTimeout(resolve, 50));');
    expect(code).toContain('setHidden_rows(response);');
  });

  it('keeps legacy __expr support', async () => {
    const code = await compileFormatted(behaviorSchemas.legacyExpressionCompatibility);

    expect(code).toContain('{formData.userName}');
  });

  it('serializes non-string initial values correctly', async () => {
    const code = await compileFormatted(behaviorSchemas.nonStringInitialValues);

    expect(code).toContain(
      'const [hidden_obj, setHidden_obj] = useState({ role: "admin", count: 2 });',
    );
    expect(code).toContain('const [hidden_num, setHidden_num] = useState(3);');
    expect(code).toContain('const [isEnabled, setIsEnabled] = useState(false);');
  });

  it('keeps customScript compatibility and sanitizes unsafe navigate urls', async () => {
    const code = await compileFormatted(behaviorSchemas.customScriptAndUnsafeNavigate);

    expect(code).toContain('const handleBtnLegacyClick = () => {');
    expect(code).toContain('onClick={handleBtnLegacyClick}');
    expect(code).toContain('Custom Script omitted');
    expect(code).toContain('window.location.href = "/"');
  });

  it('falls back safely for cycles and missing nodes', async () => {
    const code = await compileFormatted(behaviorSchemas.cycleAndMissingNode);

    expect(code).toContain('Circular ref: node_a');
    expect(code).toContain('Node missing_child Not Found');
  });
});
