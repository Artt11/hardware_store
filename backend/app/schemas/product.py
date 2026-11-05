from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from uuid import UUID
from datetime import datetime


class ProductImageSchema(BaseModel):
    id: UUID
    image_url: str
    thumbnail_url: str
    alt_text: Optional[str] = None
    is_primary: bool = False
    display_order: int = 0


class ProductBase(BaseModel):
    sku: str
    name: str
    slug: str
    unit_of_measure: str = "հատ"
    category: str = "Uncategorized"
    retail_price: float
    wholesale_price: float = 0.0
    barcode: Optional[str] = None
    vat_applicable: bool = True
    discount_percent: float = 0.0
    description: Optional[str] = None
    image_url: Optional[str] = None
    is_active: bool = True

    short_description: Optional[str] = None
    base_price: float
    compare_at_price: Optional[float] = None
    currency: str = "AMD"
    stock_quantity: int = 25
    is_published: bool = True
    specifications: Dict[str, Any] = Field(default_factory=dict)


class ProductListItem(BaseModel):
    id: UUID
    sku: str
    name: str
    slug: str
    unit_of_measure: str = "հատ"
    category: str = "Uncategorized"
    retail_price: float
    wholesale_price: float = 0.0
    barcode: Optional[str] = None
    vat_applicable: bool = True
    discount_percent: float = 0.0
    description: Optional[str] = None
    image_url: Optional[str] = None
    is_active: bool = True

    brand_name: str = "Սուրո"
    category_name: str = "Uncategorized"
    base_price: float
    compare_at_price: Optional[float] = None
    currency: str = "AMD"
    in_stock: bool = True
    stock_quantity: int = 25
    rating_average: float = 4.8
    rating_count: int = 12
    primary_image_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    key_specs: Dict[str, str] = Field(default_factory=dict)


class ProductDetail(ProductBase):
    id: UUID
    brand_name: str = "Սուրո"
    brand_logo_url: Optional[str] = None
    category_name: str = "Uncategorized"
    weight_kg: Optional[float] = None
    dimensions_cm: Optional[Dict[str, float]] = None
    rating_average: float = 4.8
    rating_count: int = 12
    images: List[ProductImageSchema] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class FacetCountItem(BaseModel):
    value: str
    label: str
    count: int


class PaginatedProductsResponse(BaseModel):
    items: List[ProductListItem]
    total: int
    limit: int
    offset: int
    page: int
    page_size: int
    total_pages: int
    has_more: bool
    has_next: bool
    has_prev: bool
    categories: List[FacetCountItem] = Field(default_factory=list)
    units: List[FacetCountItem] = Field(default_factory=list)
    min_retail_price: float = 0.0
    max_retail_price: float = 0.0
