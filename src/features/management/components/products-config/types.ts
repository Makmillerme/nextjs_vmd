export type ProductTypeItem = {
  id: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  isAutoDetected: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { products: number };
};

export type FieldDefinitionItem = {
  id: string;
  code: string | null;
  label: string;
  dataType: string;
  widgetType: string;
  isSystem: boolean;
  systemColumn: string | null;
  presetValues: string | null;
  validation: string | null;
  unit: string | null;
  defaultValue: string | null;
  placeholder: string | null;
  hiddenOnCard?: boolean;
  categoryIds?: string[];
  productTypeIds?: string[];
  createdAt: string;
  updatedAt: string;
  _count?: { tabFields: number; values: number };
};

export type TabDefinitionItem = {
  id: string;
  categoryId: string;
  name: string;
  icon: string | null;
  tabConfig: string | null;
  order: number;
  isSystem?: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { fields: number };
};

export type TabFieldItem = {
  id: string;
  tabDefinitionId: string;
  fieldDefinitionId: string;
  productTypeId: string | null;
  order: number;
  colSpan: number;
  isRequired: boolean;
  sectionTitle: string | null;
  stretchInRow?: boolean;
  fieldDefinition: FieldDefinitionItem;
};

export type StatusSummary = {
  id: string;
  name: string;
  order: number;
  color: string;
};

export type SubFunnelPolicy = "allow" | "requireComplete";

export type AccountingGroupItem = {
  id: string;
  categoryId: string;
  parentStatusId: string | null;
  nextGroupId: string | null;
  isDefault: boolean;
  showInSidebar: boolean;
  /** Лише для сателітних груп */
  subFunnelPolicy?: SubFunnelPolicy;
  startStatusId: string | null;
  endStatusId: string | null;
  startStatus?: StatusSummary | null;
  endStatus?: StatusSummary | null;
  name: string;
  order: number;
  description: string | null;
  statuses?: StatusItem[];
};

export type StatusItem = {
  id: string;
  accountingGroupId: string;
  name: string;
  code: string | null;
  color: string;
  order: number;
  description: string | null;
  isDefault: boolean;
  hasSubStatuses: boolean;
  satelliteGroups?: AccountingGroupItem[];
};

export type CategoryItem = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  order: number;
  _count?: { productTypes: number; tabs: number };
};

export type DisplayConfigItem = {
  id: string;
  roleCode: string | null;
  userId: string | null;
  categoryId: string | null;
  config: string;
  createdAt: string;
  updatedAt: string;
};
