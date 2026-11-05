'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export type Language = 'hy' | 'ru' | 'en';

const UI_DICTIONARY: Record<Language, Record<string, string>> = {
  hy: {
    // Top bar & Header
    storeLocation: 'Երևան, Պահեստ-Խանութ «Սուրո»',
    fastDeliveryBanner: 'Արագ առաքում շինհրապարակ • Մեծածախ և մանրածախ',
    b2bTradePass: 'B2B Գործընկեր',
    brandTagline: 'Շինանյութ և Գործիքներ',
    departmentsBtn: 'Բաժիններ',
    megaMenuTitle: 'Շինարարական Բաժիններ (Mega-Menu)',
    megaMenuSubtitle: 'Ընտրեք ապրանքային խումբը՝ ամբողջ տեսականին արագ զտելու համար',
    viewAllProducts: 'Դիտել բոլոր 1,391 ապրանքները →',
    searchPlaceholder: 'Որոնել ապրանք, կոդ (00001), գծիկավոր կոդ կամ գործիք...',
    searchBtn: 'Որոնել',
    suggestions: 'Առաջարկներ՝',
    noSearchResults: 'Ապրանքներ չեն գտնվել',
    viewAllSearchResults: 'Դիտել բոլոր արդյունքները',
    loginRegister: 'Մուտք / Գրանցում',
    myAccount: 'Իմ Հաշիվը',
    b2bPartner: 'B2B Գործընկեր',
    cartLabel: 'Զամբյուղ',
    inStockShort: '• Առկա է',
    backorderShort: 'Պատվերով',

    // Hero Banner
    heroBadge: 'Պաշտոնական Պահեստ-Խանութ • Սուրո',
    heroTitle: 'Շինանյութ, Ամրակներ և Պրոֆեսիոնալ Գործիքներ',
    heroSubtitle:
      'Ավելի քան 1,391 անվանում ապրանք անմիջապես պահեստից՝ մանրածախ և B2B մեծածախ գներով, ԱԱՀ հաշիվ-ապրանքագրով և արագ առաքմամբ։',
    heroCta: 'Դառնալ B2B Գործընկեր',

    // Filters Sidebar
    filtersTitle: 'Ֆիլտրեր և Որոնում',
    resetBtn: 'Մաքրել',
    quickFilterLabel: 'Արագ ֆիլտր (Կոդ կամ Անվանում)',
    quickFilterPlaceholder: 'Օր.՝ 00001, պտուտակ...',
    inStockOnly: 'Միայն առկա պահեստում',
    departmentsHeading: 'Ապրանքային Բաժիններ',
    priceRangeHeading: 'Գնային Միջակայք (֏)',
    minPriceLabel: 'Սկսած (֏)',
    maxPriceLabel: 'Մինչև (֏)',
    unitHeading: 'Չափման Միավոր / Փաթեթ',
    brandHeading: 'Մատակարար / Բրենդ',
    showProductsBtn: 'Ցուցադրել ապրանքները',

    // Catalog & Toolbar
    allCategories: 'Բոլորը',
    showingCount: 'Ցուցադրված է',
    loadedCount: 'Բեռնված է',
    productsUnit: 'ապրանք',
    sortSkuAsc: 'Ըստ Կոդի (00001 → 01391)',
    sortSkuDesc: 'Ըստ Կոդի (01391 → 00001)',
    sortPriceAsc: 'Գին՝ Էժանից Թանկ',
    sortPriceDesc: 'Գին՝ Թանկից Էժան',
    sortNameAsc: 'Անվանում (Ա → Ֆ)',
    emptyTitle: 'Ապրանքներ չեն գտնվել ըստ ընտրված ֆիլտրերի',
    emptySubtitle:
      'Փորձեք փոխել որոնման բառը, գնային միջակայքը կամ մաքրել բոլոր ֆիլտրերը՝ ամբողջ տեսականին տեսնելու համար։',
    clearAllFilters: 'Մաքրել բոլոր ֆիլտրերը',
    loadingMore: 'Բեռնվում են հաջորդ ապրանքները...',
    loadMoreBtn: 'Բեռնել ավելին',
    remainingLabel: 'մնացած',
    allLoadedText: 'Բոլոր ապրանքները ցուցադրված են',

    // Product Card & Modal
    skuLabel: 'ԿՈԴ',
    quickView: 'Դիտել',
    outOfStock: 'Առկա չէ',
    inStock: 'Առկա է',
    inStockWarehouse: 'Առկա է պահեստում',
    vatIncluded: 'ԱԱՀ ներառված',
    retailPriceLabel: 'Մանրածախ գին',
    wholesalePriceLabel: 'Մեծածախ',
    addToCart: 'Գնել',
    addedToCart: 'Ավելացված է',
    unitOfMeasureLabel: 'Չափման միավոր',
    barcodeLabel: 'Գծիկավոր կոդ',
    techSpecs: 'Տեխնիկական Բնութագրեր',
    warranty: 'Երաշխիք',
    warrantyVal: 'Պաշտոնական',

    // Cart & Checkout
    shoppingCart: 'Գնումների Զամբյուղ',
    checkoutTitle: 'Պատվերի Ձևակերպում',
    itemsCountUnit: 'հատ',
    step1Shipping: '1. Առաքում',
    step2Payment: '2. Վճարում',
    step3Review: '3. Հաստատում',
    emptyCartTitle: 'Ձեր զամբյուղը դատարկ է',
    emptyCartSubtitle: 'Ընտրեք ապրանքներ կատալոգից և ավելացրեք զամբյուղ։',
    freeShippingUnlocked: 'Դուք օգտվում եք ԱՆՎՃԱՐ առաքումից Երևանում!',
    addMoreForFreeShipping: 'Ավելացրեք ևս անվճար առաքման համար՝',
    totalAmount: 'Ընդհանուր գումար՝',
    proceedToCheckout: 'Անցնել Պատվերի Ձևակերպման (3 Քայլ)',
    b2bLoginPrompt: 'Մուտք գործել B2B հաշիվ-ապրանքագրով գնելու համար',
    deliveryJobsite: 'Առաքում շինհրապարակ',
    pickupWarehouse: 'Ինքնառաքում պահեստից',
    freeToday: 'Անվճար • Այսօր',
    freeLabel: 'Անվճար',
    recipientNameLabel: 'Ստացողի Անուն Ազգանուն',
    phoneLabel: 'Հեռախոսահամար',
    cityLabel: 'Քաղաք / Մարզ',
    addressLabel: 'Առաքման Հասցե',
    backBtn: 'Հետ',
    continueToPayment: 'Շարունակել դեպի Վճարում',
    reviewOrderBtn: 'Ստուգել պատվերը',
    confirmOrderBtn: 'Հաստատել Պատվերը',
    orderConfirmedTitle: 'Պատվերը Հաստատված է!',
    orderNumberLabel: 'Պատվերի կոդ՝',
    orderConfirmedSub: 'Մեր օպերատորը կկապվի ձեզ հետ առաքումը հաստատելու համար։',
    payCard: 'Բանկային քարտով / Idram / ArCa',
    payCardSub: 'Անվտանգ առցանց վճարում',
    payCash: 'Կանխիկ՝ առաքման պահին',
    payCashSub: 'Վճարեք պատվերը ստանալիս (ՀԴՄ կտրոնով)',
    payB2B: 'Բանկային փոխանցում (B2B Հաշիվ-Ապրանքագիր)',
    payB2BSub: 'ԱԱՀ հաշիվ-ապրանքագրի դուրսգրում e-Invoicing համակարգով',
    taxIdInputLabel: 'Կազմակերպության ՀՎՀՀ (Tax ID)',

    // Footer
    footerFastDelivery: 'Արագ Առաքում Երևանում',
    footerFastDeliverySub: 'Անմիջապես պահեստից դեպի ձեր շինհրապարակ',
    footerB2BTitle: 'B2B Մեծածախ Գներ (ԱԱՀ)',
    footerB2BSub: 'Հատուկ պայմաններ շինարարական ընկերությունների համար',
    footerStockTitle: 'Ապրանք Պահեստում',
    footerStockSub: '100% իրական մնացորդներ և ճշգրիտ գներ',
    footerHoursTitle: 'Աշխատանքային Ժամեր',
    footerHoursSub: 'Երկ – Շաբ՝ 09:00 – 19:00',
    footerAbout:
      'Պրոֆեսիոնալ շինանյութի, ամրակման միջոցների, ձեռքի և էլեկտրական գործիքների մասնագիտացված առցանց հարթակ։',
    footerDeptsTitle: 'Հիմնական Բաժիններ',
    footerSupportTitle: 'Հաճախորդների Սպասարկում',
    footerB2BCardBadge: 'B2B Գործընկերություն',
    footerB2BCardTitle: 'Շինարա՞ր եք կամ կազմակերպություն',
    footerB2BCardSub:
      'Գրանցեք ձեր կազմակերպությունը (ՀՎՀՀ-ով) և ստացեք հասանելիություն մեծածախ գներին ու ԱԱՀ հաշիվ-ապրանքագրերին։',
    footerB2BCardBtn: 'Գրանցել B2B Հաշիվ',
    footerRights: '© 2026 SuroBuild Armenia • Բոլոր իրավունքները պաշտպանված են։',
  },

  ru: {
    // Top bar & Header
    storeLocation: 'Ереван, Склад-Магазин «Суро»',
    fastDeliveryBanner: 'Быстрая доставка на стройплощадку • Оптом и в розницу',
    b2bTradePass: 'B2B Партнер',
    brandTagline: 'Стройматериалы и Инструменты',
    departmentsBtn: 'Каталог',
    megaMenuTitle: 'Строительные Разделы (Mega-Menu)',
    megaMenuSubtitle: 'Выберите категорию товаров для быстрой фильтрации каталога',
    viewAllProducts: 'Смотреть все 1,391 товаров →',
    searchPlaceholder: 'Поиск товара, артикула (00001), штрих-кода или инструмента...',
    searchBtn: 'Найти',
    suggestions: 'Подсказки:',
    noSearchResults: 'Товары не найдены',
    viewAllSearchResults: 'Смотреть все результаты для',
    loginRegister: 'Вход / Регистрация',
    myAccount: 'Мой Кабинет',
    b2bPartner: 'B2B Партнер',
    cartLabel: 'Корзина',
    inStockShort: '• В наличии',
    backorderShort: 'Под заказ',

    // Hero Banner
    heroBadge: 'Официальный Склад-Магазин • Суро',
    heroTitle: 'Стройматериалы, Крепеж и Профессиональные Инструменты',
    heroSubtitle:
      'Более 1,391 наименований напрямую со склада: розничные и оптовые B2B цены, счета-фактуры с НДС и оперативная доставка.',
    heroCta: 'Стать B2B Партнером',

    // Filters Sidebar
    filtersTitle: 'Фильтры и Поиск',
    resetBtn: 'Сбросить',
    quickFilterLabel: 'Быстрый фильтр (Код или Название)',
    quickFilterPlaceholder: 'Напр.: 00001, шуруп...',
    inStockOnly: 'Только в наличии на складе',
    departmentsHeading: 'Товарные Разделы',
    priceRangeHeading: 'Диапазон Цен (֏)',
    minPriceLabel: 'От (֏)',
    maxPriceLabel: 'До (֏)',
    unitHeading: 'Ед. Измерения / Упаковка',
    brandHeading: 'Поставщик / Бренд',
    showProductsBtn: 'Показать товары',

    // Catalog & Toolbar
    allCategories: 'Все',
    showingCount: 'Показано',
    loadedCount: 'Загружено',
    productsUnit: 'товаров',
    sortSkuAsc: 'По коду (00001 → 01391)',
    sortSkuDesc: 'По коду (01391 → 00001)',
    sortPriceAsc: 'Цена: по возрастанию',
    sortPriceDesc: 'Цена: по убыванию',
    sortNameAsc: 'Название (А → Я)',
    emptyTitle: 'По выбранным фильтрам товары не найдены',
    emptySubtitle:
      'Попробуйте изменить поисковый запрос, диапазон цен или сбросить фильтры для просмотра всего каталога.',
    clearAllFilters: 'Сбросить все фильтры',
    loadingMore: 'Загрузка следующих товаров...',
    loadMoreBtn: 'Загрузить еще',
    remainingLabel: 'осталось',
    allLoadedText: 'Все товары загружены',

    // Product Card & Modal
    skuLabel: 'КОД',
    quickView: 'Обзор',
    outOfStock: 'Нет в наличии',
    inStock: 'В наличии',
    inStockWarehouse: 'В наличии на складе',
    vatIncluded: 'С учетом НДС',
    retailPriceLabel: 'Розничная цена',
    wholesalePriceLabel: 'Оптом',
    addToCart: 'В корзину',
    addedToCart: 'Добавлено',
    unitOfMeasureLabel: 'Ед. измерения',
    barcodeLabel: 'Штрих-код',
    techSpecs: 'Технические Характеристики',
    warranty: 'Гарантия',
    warrantyVal: 'Официальная',

    // Cart & Checkout
    shoppingCart: 'Корзина Покупок',
    checkoutTitle: 'Оформление Заказа',
    itemsCountUnit: 'шт.',
    step1Shipping: '1. Доставка',
    step2Payment: '2. Оплата',
    step3Review: '3. Проверка',
    emptyCartTitle: 'Ваша корзина пуста',
    emptyCartSubtitle: 'Выберите товары из каталога и добавьте их в корзину.',
    freeShippingUnlocked: 'Вам доступна БЕСПЛАТНАЯ доставка по Еревану!',
    addMoreForFreeShipping: 'Добавьте еще для бесплатной доставки:',
    totalAmount: 'Итоговая сумма:',
    proceedToCheckout: 'Перейти к Оформлению (3 Шага)',
    b2bLoginPrompt: 'Войти для покупки по B2B счету-фактуре',
    deliveryJobsite: 'Доставка на объект',
    pickupWarehouse: 'Самовывоз со склада',
    freeToday: 'Бесплатно • Сегодня',
    freeLabel: 'Бесплатно',
    recipientNameLabel: 'ФИО Получателя',
    phoneLabel: 'Номер телефона',
    cityLabel: 'Город / Регион',
    addressLabel: 'Адрес доставки',
    backBtn: 'Назад',
    continueToPayment: 'Перейти к Оплате',
    reviewOrderBtn: 'Проверить заказ',
    confirmOrderBtn: 'Подтвердить Заказ',
    orderConfirmedTitle: 'Заказ Подтвержден!',
    orderNumberLabel: 'Номер заказа:',
    orderConfirmedSub: 'Наш оператор свяжется с вами для подтверждения доставки.',
    payCard: 'Банковской картой / Idram / ArCa',
    payCardSub: 'Безопасная онлайн оплата',
    payCash: 'Наличными при получении',
    payCashSub: 'Оплата при получении заказа (с кассовым чеком)',
    payB2B: 'Банковский перевод (B2B Счет-Фактура)',
    payB2BSub: 'Выставление налоговой счет-фактуры с НДС (e-Invoicing)',
    taxIdInputLabel: 'ИНН Организации (ՀՎՀՀ / Tax ID)',

    // Footer
    footerFastDelivery: 'Быстрая Доставка по Еревану',
    footerFastDeliverySub: 'Напрямую со склада на вашу стройплощадку',
    footerB2BTitle: 'Оптовые B2B Цены (с НДС)',
    footerB2BSub: 'Специальные условия для строительных компаний',
    footerStockTitle: 'Товаров на Складе',
    footerStockSub: '100% актуальные остатки и точные цены',
    footerHoursTitle: 'Часы Работы',
    footerHoursSub: 'Пн – Сб: 09:00 – 19:00',
    footerAbout:
      'Специализированная онлайн-платформа профессиональных стройматериалов, крепежа, ручного и электроинструмента.',
    footerDeptsTitle: 'Основные Разделы',
    footerSupportTitle: 'Обслуживание Клиентов',
    footerB2BCardBadge: 'B2B Партнерство',
    footerB2BCardTitle: 'Вы строитель или организация?',
    footerB2BCardSub:
      'Зарегистрируйте компанию (с ИНН/ՀՎՀՀ) и получите доступ к оптовым ценам и счетам-фактурам с НДС.',
    footerB2BCardBtn: 'Открыть B2B Счет',
    footerRights: '© 2026 SuroBuild Armenia • Все права защищены.',
  },

  en: {
    // Top bar & Header
    storeLocation: 'Yerevan, "Suro" Trade Warehouse & Store',
    fastDeliveryBanner: 'Rapid Jobsite Delivery • Wholesale & Retail',
    b2bTradePass: 'B2B Trade Pass',
    brandTagline: 'Hardware & Trade Tools',
    departmentsBtn: 'Departments',
    megaMenuTitle: 'Hardware Departments (Mega-Menu)',
    megaMenuSubtitle: 'Select a product department to filter the full catalog instantly',
    viewAllProducts: 'View all 1,391 products →',
    searchPlaceholder: 'Search products, SKU (00001), barcode, or hardware...',
    searchBtn: 'Search',
    suggestions: 'Suggestions:',
    noSearchResults: 'No products found matching',
    viewAllSearchResults: 'View all results for',
    loginRegister: 'Sign In / Join',
    myAccount: 'My Account',
    b2bPartner: 'B2B Partner',
    cartLabel: 'Cart',
    inStockShort: '• In Stock',
    backorderShort: 'Backorder',

    // Hero Banner
    heroBadge: 'Official Trade Warehouse • Suro',
    heroTitle: 'Building Materials, Fasteners & Professional Tools',
    heroSubtitle:
      'Over 1,391 stocked items direct from our warehouse with retail & B2B wholesale pricing, VAT e-invoicing, and rapid jobsite delivery.',
    heroCta: 'Apply for B2B Trade Account',

    // Filters Sidebar
    filtersTitle: 'Filters & Search',
    resetBtn: 'Reset',
    quickFilterLabel: 'Quick Filter (SKU or Name)',
    quickFilterPlaceholder: 'e.g., 00001, screw...',
    inStockOnly: 'In Stock Only',
    departmentsHeading: 'Product Departments',
    priceRangeHeading: 'Price Range (֏)',
    minPriceLabel: 'Min (֏)',
    maxPriceLabel: 'Max (֏)',
    unitHeading: 'Unit of Measure / Pack',
    brandHeading: 'Supplier / Brand',
    showProductsBtn: 'Show Products',

    // Catalog & Toolbar
    allCategories: 'All',
    showingCount: 'Showing',
    loadedCount: 'Loaded',
    productsUnit: 'products',
    sortSkuAsc: 'SKU Code (00001 → 01391)',
    sortSkuDesc: 'SKU Code (01391 → 00001)',
    sortPriceAsc: 'Price: Low to High',
    sortPriceDesc: 'Price: High to Low',
    sortNameAsc: 'Name (A → Z)',
    emptyTitle: 'No products match your selected filters',
    emptySubtitle:
      'Try adjusting your search query, price range, or reset all filters to browse the full warehouse catalog.',
    clearAllFilters: 'Clear All Filters',
    loadingMore: 'Loading more products...',
    loadMoreBtn: 'Load More',
    remainingLabel: 'remaining',
    allLoadedText: 'All products loaded',

    // Product Card & Modal
    skuLabel: 'SKU',
    quickView: 'Quick View',
    outOfStock: 'Out of Stock',
    inStock: 'In Stock',
    inStockWarehouse: 'In Stock at Warehouse',
    vatIncluded: 'VAT Included',
    retailPriceLabel: 'Retail Price',
    wholesalePriceLabel: 'Wholesale',
    addToCart: 'Add to Cart',
    addedToCart: 'Added',
    unitOfMeasureLabel: 'Unit of Measure',
    barcodeLabel: 'Barcode',
    techSpecs: 'Technical Specifications',
    warranty: 'Warranty',
    warrantyVal: 'Official Trade Warranty',

    // Cart & Checkout
    shoppingCart: 'Shopping Cart',
    checkoutTitle: 'Secure Checkout',
    itemsCountUnit: 'items',
    step1Shipping: '1. Shipping',
    step2Payment: '2. Payment',
    step3Review: '3. Review',
    emptyCartTitle: 'Your cart is empty',
    emptyCartSubtitle: 'Browse our hardware catalog and add items to your cart.',
    freeShippingUnlocked: 'You unlocked FREE delivery in Yerevan!',
    addMoreForFreeShipping: 'Add more for Free Delivery:',
    totalAmount: 'Subtotal:',
    proceedToCheckout: 'Proceed to Checkout (3 Steps)',
    b2bLoginPrompt: 'Sign in for B2B Commercial Invoice checkout',
    deliveryJobsite: 'Jobsite Delivery',
    pickupWarehouse: 'Warehouse Click & Collect',
    freeToday: 'Free • Ready Today',
    freeLabel: 'Free',
    recipientNameLabel: 'Recipient Full Name',
    phoneLabel: 'Phone Number',
    cityLabel: 'City / Region',
    addressLabel: 'Delivery Street Address',
    backBtn: 'Back',
    continueToPayment: 'Continue to Payment',
    reviewOrderBtn: 'Review Order',
    confirmOrderBtn: 'Confirm & Place Order',
    orderConfirmedTitle: 'Order Confirmed!',
    orderNumberLabel: 'Order #:',
    orderConfirmedSub: 'Our dispatch team will contact you shortly to confirm delivery.',
    payCard: 'Credit / Debit Card / Idram / ArCa',
    payCardSub: 'Instant secure online payment',
    payCash: 'Cash on Delivery',
    payCashSub: 'Pay upon receiving your order (with fiscal receipt)',
    payB2B: 'Bank Wire Transfer (B2B VAT Invoice)',
    payB2BSub: 'Official VAT e-Invoice issued to your company Tax ID',
    taxIdInputLabel: 'Company Tax ID (ՀՎՀՀ)',

    // Footer
    footerFastDelivery: 'Rapid Yerevan Delivery',
    footerFastDeliverySub: 'Direct from our warehouse to your construction site',
    footerB2BTitle: 'B2B Wholesale Pricing (VAT)',
    footerB2BSub: 'Dedicated terms for contractors and building companies',
    footerStockTitle: 'Stocked Products',
    footerStockSub: '100% live warehouse inventory and accurate pricing',
    footerHoursTitle: 'Opening Hours',
    footerHoursSub: 'Mon – Sat: 09:00 – 19:00',
    footerAbout:
      'Specialized online trade platform for building materials, fasteners, hand tools, and power equipment.',
    footerDeptsTitle: 'Key Departments',
    footerSupportTitle: 'Customer Support',
    footerB2BCardBadge: 'B2B Trade Pass',
    footerB2BCardTitle: 'Contractor or Business?',
    footerB2BCardSub:
      'Register your company with your Tax ID to unlock wholesale trade pricing and automated VAT invoices.',
    footerB2BCardBtn: 'Register B2B Account',
    footerRights: '© 2026 SuroBuild Armenia • All rights reserved.',
  },
};

const CATEGORY_TRANSLATIONS: Record<string, Record<Language, string>> = {
  'Ամրակման միջոցներ': {
    hy: 'Ամրակման միջոցներ',
    ru: 'Крепежные изделия',
    en: 'Fasteners & Fixings',
  },
  'Կտրող և հղկող գործիքներ': {
    hy: 'Կտրող և հղկող գործիքներ',
    ru: 'Режущий и шлифовальный инструмент',
    en: 'Cutting & Abrasive Tools',
  },
  'Ձեռքի գործիքներ': {
    hy: 'Ձեռքի գործիքներ',
    ru: 'Ручной инструмент',
    en: 'Hand Tools',
  },
  'Ներկարարական և քիմիա': {
    hy: 'Ներկարարական և քիմիա',
    ru: 'Лакокраска и стройхимия',
    en: 'Paint & Construction Chemicals',
  },
  'Սանտեխնիկա և խողովակներ': {
    hy: 'Սանտեխնիկա և խողովակներ',
    ru: 'Сантехника и трубы',
    en: 'Plumbing & Pipes',
  },
  'Էլեկտրական գործիքներ': {
    hy: 'Էլեկտրական գործիքներ',
    ru: 'Электротовары и инструмент',
    en: 'Electrical & Power Tools',
  },
  'Չափիչ գործիքներ': {
    hy: 'Չափիչ գործիքներ',
    ru: 'Измерительный инструмент',
    en: 'Measuring & Layout Tools',
  },
  'Անվտանգություն և հանդերձանք': {
    hy: 'Անվտանգություն և հանդերձանք',
    ru: 'СИЗ и спецодежда',
    en: 'Safety & Workwear (PPE)',
  },
  Uncategorized: {
    hy: 'Ընդհանուր շինանյութ',
    ru: 'Общие стройматериалы',
    en: 'General Hardware',
  },
};

const DEPARTMENT_SUBTITLES: Record<string, Record<Language, string>> = {
  'Ամրակման միջոցներ': {
    hy: 'Պտուտակներ, դյուբելներ, անգերներ, խաչուկներ',
    ru: 'Шурупы, дюбели, анкеры, крестики для плитки',
    en: 'Screws, wall plugs, anchors, tile spacers',
  },
  'Կտրող և հղկող գործիքներ': {
    hy: 'Սկավառակներ, շաղափներ, բուրեր, հղկաթղթեր',
    ru: 'Диски отрезные, сверла, буры, наждачная бумага',
    en: 'Cutting discs, drill bits, SDS bits, abrasives',
  },
  'Ձեռքի գործիքներ': {
    hy: 'Մուրճեր, պտուտակահաններ, բանալիներ, աքցաններ',
    ru: 'Молотки, отвертки, гаечные ключи, плоскогубцы',
    en: 'Hammers, screwdrivers, wrenches, pliers',
  },
  'Ներկարարական և քիմիա': {
    hy: 'Սիլիկոններ, փրփուրներ, ներկեր, սոսինձներ, ժապավեններ',
    ru: 'Силиконы, монтажная пена, краски, клеи, ленты',
    en: 'Silicones, PU foam, paints, adhesives, tapes',
  },
  'Սանտեխնիկա և խողովակներ': {
    hy: 'Ծորակներ, խողովակներ, փականներ, սիֆոններ',
    ru: 'Смесители, трубы, краны, сифоны, фитинги',
    en: 'Faucets, pipes, valves, traps, fittings',
  },
  'Էլեկտրական գործիքներ': {
    hy: 'Մալուխներ, լուսարձակներ, վարդակներ, էլեկտրական սարքեր',
    ru: 'Кабели, прожекторы, розетки, электроприборы',
    en: 'Cables, floodlights, sockets, electrical gear',
  },
  'Չափիչ գործիքներ': {
    hy: 'Մետրեր, հարթաչափեր, անկյունակներ',
    ru: 'Рулетки, строительные уровни, угольники',
    en: 'Tape measures, spirit levels, squares',
  },
  'Անվտանգություն և հանդերձանք': {
    hy: 'Պաշտպանիչ ձեռնոցներ, դիմակներ, ակնոցներ',
    ru: 'Защитные перчатки, маски, очки, каски',
    en: 'Work gloves, respirators, safety glasses',
  },
};

const UNIT_TRANSLATIONS: Record<string, Record<Language, string>> = {
  հատ: { hy: 'հատ', ru: 'шт.', en: 'pcs' },
  տուփ: { hy: 'տուփ', ru: 'уп.', en: 'box' },
  կգ: { hy: 'կգ', ru: 'кг', en: 'kg' },
  մ: { hy: 'մ', ru: 'м', en: 'm' },
  զույգ: { hy: 'զույգ', ru: 'пара', en: 'pair' },
  լ: { hy: 'լ', ru: 'л', en: 'L' },
  հավաքածու: { hy: 'հավաքածու', ru: 'компл.', en: 'set' },
  գլանափաթեթ: { hy: 'գլանափաթեթ', ru: 'рулон', en: 'roll' },
  պարկ: { hy: 'պարկ', ru: 'мешок', en: 'bag' },
};

interface LanguageContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: string) => string;
  translateCategory: (rawCategory: string) => string;
  translateDepartmentSubtitle: (rawCategory: string) => string;
  translateUnit: (rawUnit: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Language>(() => {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('suro_lang') as Language | null;
      if (saved === 'hy' || saved === 'ru' || saved === 'en') {
        return saved;
      }
    }
    return 'hy';
  });

  const setLang = (next: Language) => {
    setLangState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('suro_lang', next);
    }
  };

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const t = (key: string): string => {
    return UI_DICTIONARY[lang]?.[key] || UI_DICTIONARY.hy[key] || key;
  };

  const translateCategory = (rawCategory: string): string => {
    const clean = (rawCategory || 'Uncategorized').trim();
    return CATEGORY_TRANSLATIONS[clean]?.[lang] || clean;
  };

  const translateDepartmentSubtitle = (rawCategory: string): string => {
    return DEPARTMENT_SUBTITLES[rawCategory]?.[lang] || '';
  };

  const translateUnit = (rawUnit: string): string => {
    const clean = (rawUnit || 'հատ').trim().toLowerCase();
    return UNIT_TRANSLATIONS[clean]?.[lang] || rawUnit;
  };

  return (
    <LanguageContext.Provider
      value={{
        lang,
        setLang,
        t,
        translateCategory,
        translateDepartmentSubtitle,
        translateUnit,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
};

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return ctx;
}

