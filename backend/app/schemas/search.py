from pydantic import BaseModel, Field
from typing import Optional, List, Dict
from uuid import UUID


class AutocompleteProductHit(BaseModel):
    id: UUID
    name: str
    slug: str
    sku: str
    brand: str
    category: str
    price: float
    retail_price: float = 0.0
    unit_of_measure: str = "հատ"
    compare_at_price: Optional[float] = None
    currency: str = "AMD"
    thumbnail_url: Optional[str] = None
    thumbnailUrl: Optional[str] = None
    in_stock: bool = True
    inStock: bool = True
    stock_quantity: int = 25
    stockQuantity: int = 25
    highlight: Optional[str] = None


class AutocompleteResponse(BaseModel):
    query: str
    total_matches: int
    suggestions: List[str] = []
    products: List[AutocompleteProductHit] = []


class FacetBucket(BaseModel):
    value: str
    count: int
    label: Optional[str] = None


class FacetGroup(BaseModel):
    name: str
    title: str
    buckets: List[FacetBucket]


class FacetedSearchResponse(BaseModel):
    query: Optional[str] = None
    total: int
    page: int
    page_size: int
    products: List[AutocompleteProductHit]
    facets: Dict[str, List[FacetBucket]]
