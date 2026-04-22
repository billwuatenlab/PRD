import { useEffect, useState } from 'react';
import { Card, Form, Input, InputNumber, Select, Button, message, Empty, Spin } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../store/app';
import { fetchProduct, updateProduct } from '../../api';

const PART_TYPES = ['C', 'S', 'E', 'D', 'A', 'M', 'N', 'B', 'U', 'F', 'P', 'J', 'X', 'W'];

export default function ProductEdit() {
  const { t } = useTranslation();
  const { selectedProductId } = useAppStore();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (selectedProductId) {
      setLoading(true);
      fetchProduct(selectedProductId)
        .then((data) => form.setFieldsValue(data))
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [selectedProductId]);

  const handleSave = async () => {
    if (!selectedProductId) return;
    try {
      const values = await form.validateFields();
      setSaving(true);
      await updateProduct(selectedProductId, values);
      message.success(t('products.save') + ' ✓');
    } catch (e) {
      console.error('Save failed', e);
      message.error('Save failed');
    }
    setSaving(false);
  };

  if (!selectedProductId) {
    return (
      <Card>
        <Empty description={t('edit.selectFirst')} />
      </Card>
    );
  }

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>;
  }

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>{t('menu.edit')}</h2>
      <Card>
        <Form form={form} layout="vertical" style={{ maxWidth: 800 }}>
          <Form.Item label={t('products.pn')} name="pn">
            <Input style={{ fontFamily: 'monospace' }} />
          </Form.Item>
          <Form.Item label={t('products.name')} name="name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label={t('products.description')} name="description">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item label={t('products.partType')} name="part_type">
            <Select allowClear>
              {PART_TYPES.map((pt) => (
                <Select.Option key={pt} value={pt}>{t(`partTypes.${pt}`)} ({pt})</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label={t('products.cost')} name="cost">
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item label={t('products.quantity')} name="quantity">
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item label={t('products.unitPrice')} name="unit_price">
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item label={t('products.leadDays')} name="lead_days">
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item label={t('products.owner')} name="owner">
            <Input />
          </Form.Item>
          <Form.Item label={t('products.keynote')} name="keynote">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item label={t('products.note')} name="note">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item label={t('products.link')} name="link">
            <Input />
          </Form.Item>
          <Form.Item>
            <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
              {t('products.save')}
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
