import { Card, Descriptions, Empty } from 'antd';
import { useTranslation } from 'react-i18next';

export default function SystemPage() {
  const { t } = useTranslation();

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>{t('menu.system')}</h2>
      <Card title={t('system.info')}>
        <Descriptions column={1} bordered size="small">
          <Descriptions.Item label={t('system.version')}>1.0.0</Descriptions.Item>
          <Descriptions.Item label={t('system.database')}>SQLite</Descriptions.Item>
          <Descriptions.Item label={t('system.server')}>Express + better-sqlite3</Descriptions.Item>
          <Descriptions.Item label={t('system.client')}>React 19 + Ant Design 6</Descriptions.Item>
        </Descriptions>
      </Card>
    </div>
  );
}
