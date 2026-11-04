export type AccountType = 'individual' | 'company';

export interface UserProfile {
  id: string;
  email: string;
  account_type: AccountType;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  tax_id?: string;
  contact_person?: string;
  phone?: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export interface RegisterFormData {
  account_type: AccountType;
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  tax_id?: string;
  contact_person?: string;
  phone?: string;
}

export interface OrderHistoryItem {
  id: string;
  order_number: string;
  date: string;
  status: 'processing' | 'shipped' | 'delivered';
  total: number;
  items_count: number;
  tracking_number?: string;
  shipping_carrier?: string;
}
