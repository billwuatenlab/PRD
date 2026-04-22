import { Card, Empty } from 'antd';
import { useTranslation } from 'react-i18next';

export default function Quotation() {
  const { t } = useTranslation();

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>{t('menu.quotation')}</h2>
      <Card>
        <Empty description={t('quotation.comingSoon')} />
      </Card>
    </div>
  );
}
