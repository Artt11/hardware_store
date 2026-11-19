import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { LANGS, categoryName, cityName, formatMoney, unitLabel, type Lang } from './format';

export { LANGS, type Lang };

const hy = {
  'brand.tagline': 'Շինանյութ և գործիքներ',
  'a11y.skip': 'Անցնել բովանդակությանը',
  'a11y.main_nav': 'Հիմնական նավիգացիա',
  'a11y.language': 'Լեզու',
  'a11y.pagination': 'Էջեր',
  'nav.catalog': 'Կատալոգ',
  'nav.wishlist': 'Նախընտրածներ',
  'nav.account': 'Իմ էջը',
  'nav.signin': 'Մուտք',
  'nav.cart': 'Զամբյուղ',
  'search.placeholder': 'Որոնել ապրանք, կոդ կամ շտրիխ-կոդ…',
  'search.no_results': 'Ոչինչ չգտնվեց',
  'search.all_results': 'Բոլոր արդյունքները',
  'hero.title': 'Շինանյութ և գործիքներ՝ մեկ տեղում',
  'hero.subtitle': 'Ավելի քան 1200 ապրանք պահեստում։ Անվճար առաքում 50 000 ֏-ից, ընկերությունների համար՝ մեծածախ գներ և հաշիվ-ապրանքագիր։',
  'catalog.title': 'Կատալոգ',
  'catalog.results': '{count} ապրանք',
  'catalog.categories': 'Բաժիններ',
  'catalog.in_stock_only': 'Միայն առկա',
  'catalog.clear': 'Մաքրել ֆիլտրերը',
  'catalog.sort': 'Դասավորել',
  'sort.relevance': 'Ըստ համապատասխանության',
  'sort.name': 'Ըստ անվան',
  'sort.price_asc': 'Գինը՝ աճման կարգով',
  'sort.price_desc': 'Գինը՝ նվազման կարգով',
  'sort.newest': 'Նորերը',
  'catalog.empty': 'Այս ֆիլտրերով ապրանք չկա',
  'catalog.empty_hint': 'Փոխեք որոնումը կամ մաքրեք ֆիլտրերը։',
  'catalog.error': 'Կատալոգը չբեռնվեց',
  'catalog.retry': 'Կրկին փորձել',
  'catalog.prev': 'Նախորդ',
  'catalog.next': 'Հաջորդ',
  'catalog.page': 'Էջ {page} / {pages}',
  'catalog.filters': 'Ֆիլտրեր',
  'product.in_stock': 'Առկա է',
  'product.low_stock': 'Մնացել է {count}',
  'product.out_of_stock': 'Առկա չէ',
  'product.add': 'Ավելացնել',
  'product.added': 'Զամբյուղում է',
  'product.wholesale': 'Մեծածախ գին',
  'product.retail_was': 'Մանրածախ՝ {price}',
  'product.sku': 'Կոդ',
  'product.barcode': 'Շտրիխ-կոդ',
  'product.unit': 'Միավոր',
  'product.category': 'Բաժին',
  'product.back': 'Վերադառնալ կատալոգ',
  'product.not_found': 'Ապրանքը չի գտնվել',
  'product.quantity': 'Քանակ',
  'wishlist.add': 'Ավելացնել նախընտրածներին',
  'wishlist.remove': 'Հեռացնել նախընտրածներից',
  'wishlist.title': 'Նախընտրածներ',
  'wishlist.empty': 'Նախընտրած ապրանքներ դեռ չկան',
  'cart.title': 'Զամբյուղ',
  'cart.empty': 'Զամբյուղը դատարկ է',
  'cart.continue': 'Շարունակել գնումները',
  'cart.subtotal': 'Ապրանքներ',
  'cart.shipping': 'Առաքում',
  'cart.free_shipping_left': 'ԵՒս {amount}՝ անվճար առաքման համար',
  'cart.free_shipping_reached': 'Առաքումն անվճար է',
  'cart.checkout': 'Ձևակերպել պատվերը',
  'cart.remove': 'Հեռացնել',
  'cart.unavailable': 'Առկա է միայն {count}',
  'cart.close': 'Փակել',
  'checkout.title': 'Պատվերի ձևակերպում',
  'checkout.contact': 'Կոնտակտային տվյալներ',
  'checkout.name': 'Անուն, ազգանուն',
  'checkout.phone': 'Հեռախոս',
  'checkout.email': 'Էլ. փոստ',
  'checkout.delivery': 'Ստացման եղանակ',
  'checkout.express': 'Առաքում',
  'checkout.express_hint': '2 500 ֏, անվճար 50 000 ֏-ից',
  'checkout.pickup': 'Վերցնել խանութից',
  'checkout.pickup_hint': 'Անվճար, Երևան',
  'checkout.city': 'Քաղաք',
  'checkout.address': 'Հասցե',
  'checkout.payment': 'Վճարում',
  'checkout.card': 'Քարտով',
  'checkout.cash': 'Կանխիկ՝ ստանալիս',
  'checkout.invoice': 'Հաշիվ-ապրանքագիր (B2B)',
  'checkout.invoice_hint': 'Վճարում {days} օրվա ընթացքում',
  'checkout.notes': 'Մեկնաբանություն',
  'checkout.summary': 'Ձեր պատվերը',
  'checkout.total': 'Ընդամենը',
  'checkout.place': 'Հաստատել պատվերը',
  'checkout.placing': 'Ձևակերպվում է…',
  'checkout.shortage': 'Որոշ ապրանքներ այլևս առկա չեն պահանջված քանակով․',
  'checkout.shortage_line': '{name}՝ պահանջված {requested}, առկա {available}',
  'checkout.error': 'Պատվերը չձևակերպվեց։ Ձեր զամբյուղը պահպանված է։',
  'checkout.success_title': 'Շնորհակալություն, պատվերն ընդունված է',
  'checkout.success_number': 'Պատվերի համարը՝ {number}',
  'checkout.success_hint': 'Մենք կզանգահարենք Ձեզ հաստատելու համար։',
  'auth.signin': 'Մուտք',
  'auth.register': 'Գրանցում',
  'auth.email': 'Էլ. փոստ',
  'auth.password': 'Գաղտնաբառ',
  'auth.password_hint': 'Առնվազն 10 նիշ, տառեր և թվեր',
  'auth.individual': 'Ֆիզիկական անձ',
  'auth.company': 'Ընկերություն',
  'auth.first_name': 'Անուն',
  'auth.last_name': 'Ազգանուն',
  'auth.phone': 'Հեռախոս',
  'auth.company_name': 'Ընկերության անվանում',
  'auth.tax_id': 'ՀՎՀՀ',
  'auth.tax_id_hint': '8 թվանշան',
  'auth.tax_id_invalid': 'ՀՎՀՀ-ն պետք է լինի ուղիղ 8 թվանշան',
  'auth.contact_person': 'Կոնտակտային անձ',
  'auth.company_note': 'Մեծածախ գներն ու հաշիվ-ապրանքագիրը հասանելի կլինեն տվյալների ստուգումից հետո։',
  'auth.submit_signin': 'Մուտք գործել',
  'auth.submit_register': 'Գրանցվել',
  'auth.no_account': 'Չունե՞ք հաշիվ',
  'auth.have_account': 'Արդեն գրանցվա՞ծ եք',
  'auth.error': 'Չհաջողվեց։ Ստուգեք տվյալները։',
  'account.title': 'Իմ էջը',
  'account.profile': 'Անձնական տվյալներ',
  'account.orders': 'Պատվերներ',
  'account.no_orders': 'Դեռ պատվերներ չկան',
  'account.signout': 'Ելք',
  'account.b2b_active': 'B2B հաշիվ՝ մեծածախ գներ և հաշիվ-ապրանքագիր',
  'account.b2b_pending': 'Ընկերության տվյալները ստուգվում են։ Մինչ այդ գործում են մանրածախ գները։',
  'account.order_items': '{count} միավոր',
  'account.back_to_orders': 'Բոլոր պատվերները',
  'order.status.pending': 'Ընդունված',
  'order.status.confirmed': 'Հաստատված',
  'order.status.shipped': 'Ճանապարհին',
  'order.status.delivered': 'Առաքված',
  'order.status.cancelled': 'Չեղարկված',
  'order.due': 'Վճարման ժամկետ՝ {date}',
  'common.loading': 'Բեռնվում է…',
  'common.close': 'Փակել',
  'common.network': 'Կապ չկա սերվերի հետ։ Փորձեք կրկին։',
  'footer.rights': 'Բոլոր իրավունքները պաշտպանված են',
  'footer.photo_note': 'Ապրանքների լուսանկարները՝ խանութի',
};

type Key = keyof typeof hy;
type Dictionary = Record<Key, string>;

const ru: Dictionary = {
  'brand.tagline': 'Стройматериалы и инструменты',
  'a11y.skip': 'Перейти к содержимому', 'a11y.main_nav': 'Основная навигация', 'a11y.language': 'Язык', 'a11y.pagination': 'Страницы',
  'nav.catalog': 'Каталог', 'nav.wishlist': 'Избранное', 'nav.account': 'Кабинет', 'nav.signin': 'Войти', 'nav.cart': 'Корзина',
  'search.placeholder': 'Товар, код или штрихкод…', 'search.no_results': 'Ничего не найдено', 'search.all_results': 'Все результаты',
  'hero.title': 'Стройматериалы и инструменты в одном месте',
  'hero.subtitle': 'Более 1200 товаров на складе. Бесплатная доставка от 50 000 AMD, для компаний — оптовые цены и оплата по счёту.',
  'catalog.title': 'Каталог', 'catalog.results': '{count} товаров', 'catalog.categories': 'Разделы', 'catalog.in_stock_only': 'Только в наличии',
  'catalog.clear': 'Сбросить фильтры', 'catalog.sort': 'Сортировка', 'sort.relevance': 'По релевантности', 'sort.name': 'По названию',
  'sort.price_asc': 'Сначала дешевле', 'sort.price_desc': 'Сначала дороже', 'sort.newest': 'Новинки',
  'catalog.empty': 'По этим фильтрам товаров нет', 'catalog.empty_hint': 'Измените запрос или сбросьте фильтры.',
  'catalog.error': 'Не удалось загрузить каталог', 'catalog.retry': 'Повторить', 'catalog.prev': 'Назад', 'catalog.next': 'Вперёд',
  'catalog.page': 'Стр. {page} из {pages}', 'catalog.filters': 'Фильтры',
  'product.in_stock': 'В наличии', 'product.low_stock': 'Осталось {count}', 'product.out_of_stock': 'Нет в наличии',
  'product.add': 'В корзину', 'product.added': 'В корзине', 'product.wholesale': 'Оптовая цена', 'product.retail_was': 'Розница: {price}',
  'product.sku': 'Код', 'product.barcode': 'Штрихкод', 'product.unit': 'Единица', 'product.category': 'Раздел',
  'product.back': 'Назад в каталог', 'product.not_found': 'Товар не найден', 'product.quantity': 'Количество',
  'wishlist.add': 'В избранное', 'wishlist.remove': 'Убрать из избранного', 'wishlist.title': 'Избранное', 'wishlist.empty': 'В избранном пока пусто',
  'cart.title': 'Корзина', 'cart.empty': 'Корзина пуста', 'cart.continue': 'Продолжить покупки', 'cart.subtotal': 'Товары',
  'cart.shipping': 'Доставка', 'cart.free_shipping_left': 'Ещё {amount} до бесплатной доставки', 'cart.free_shipping_reached': 'Доставка бесплатна',
  'cart.checkout': 'Оформить заказ', 'cart.remove': 'Удалить', 'cart.unavailable': 'В наличии только {count}', 'cart.close': 'Закрыть',
  'checkout.title': 'Оформление заказа', 'checkout.contact': 'Контакты', 'checkout.name': 'Имя и фамилия', 'checkout.phone': 'Телефон',
  'checkout.email': 'Эл. почта', 'checkout.delivery': 'Способ получения', 'checkout.express': 'Доставка', 'checkout.express_hint': '2 500 AMD, бесплатно от 50 000 AMD',
  'checkout.pickup': 'Самовывоз', 'checkout.pickup_hint': 'Бесплатно, Ереван', 'checkout.city': 'Город', 'checkout.address': 'Адрес',
  'checkout.payment': 'Оплата', 'checkout.card': 'Картой', 'checkout.cash': 'Наличными при получении', 'checkout.invoice': 'По счёту (B2B)',
  'checkout.invoice_hint': 'Оплата в течение {days} дней', 'checkout.notes': 'Комментарий', 'checkout.summary': 'Ваш заказ', 'checkout.total': 'Итого',
  'checkout.place': 'Подтвердить заказ', 'checkout.placing': 'Оформляем…', 'checkout.shortage': 'Некоторых товаров нет в нужном количестве:',
  'checkout.shortage_line': '{name}: нужно {requested}, есть {available}', 'checkout.error': 'Заказ не оформлен. Корзина сохранена.',
  'checkout.success_title': 'Спасибо, заказ принят', 'checkout.success_number': 'Номер заказа: {number}', 'checkout.success_hint': 'Мы позвоним для подтверждения.',
  'auth.signin': 'Вход', 'auth.register': 'Регистрация', 'auth.email': 'Эл. почта', 'auth.password': 'Пароль', 'auth.password_hint': 'Не менее 10 символов, буквы и цифры',
  'auth.individual': 'Частное лицо', 'auth.company': 'Компания', 'auth.first_name': 'Имя', 'auth.last_name': 'Фамилия', 'auth.phone': 'Телефон',
  'auth.company_name': 'Название компании', 'auth.tax_id': 'ИНН (ՀՎՀՀ)', 'auth.tax_id_hint': '8 цифр', 'auth.tax_id_invalid': 'ИНН должен состоять ровно из 8 цифр',
  'auth.contact_person': 'Контактное лицо', 'auth.company_note': 'Оптовые цены и оплата по счёту станут доступны после проверки данных.',
  'auth.submit_signin': 'Войти', 'auth.submit_register': 'Зарегистрироваться', 'auth.no_account': 'Нет аккаунта?', 'auth.have_account': 'Уже зарегистрированы?',
  'auth.error': 'Не получилось. Проверьте данные.',
  'account.title': 'Личный кабинет', 'account.profile': 'Профиль', 'account.orders': 'Заказы', 'account.no_orders': 'Заказов пока нет', 'account.signout': 'Выйти',
  'account.b2b_active': 'B2B-аккаунт: оптовые цены и оплата по счёту', 'account.b2b_pending': 'Данные компании проверяются. Пока действуют розничные цены.',
  'account.order_items': '{count} шт.', 'account.back_to_orders': 'Все заказы',
  'order.status.pending': 'Принят', 'order.status.confirmed': 'Подтверждён', 'order.status.shipped': 'В пути', 'order.status.delivered': 'Доставлен', 'order.status.cancelled': 'Отменён',
  'order.due': 'Оплатить до {date}', 'common.loading': 'Загрузка…', 'common.close': 'Закрыть', 'common.network': 'Нет связи с сервером. Попробуйте ещё раз.',
  'footer.rights': 'Все права защищены', 'footer.photo_note': 'Фото товаров — магазина',
};

const en: Dictionary = {
  'brand.tagline': 'Building materials and tools',
  'a11y.skip': 'Skip to content', 'a11y.main_nav': 'Main navigation', 'a11y.language': 'Language', 'a11y.pagination': 'Pages',
  'nav.catalog': 'Catalog', 'nav.wishlist': 'Wishlist', 'nav.account': 'Account', 'nav.signin': 'Sign in', 'nav.cart': 'Cart',
  'search.placeholder': 'Product, code or barcode…', 'search.no_results': 'No matches', 'search.all_results': 'All results',
  'hero.title': 'Building materials and tools in one place',
  'hero.subtitle': 'Over 1,200 products in stock. Free delivery from 50,000 AMD; companies get wholesale prices and invoice payment.',
  'catalog.title': 'Catalog', 'catalog.results': '{count} products', 'catalog.categories': 'Categories', 'catalog.in_stock_only': 'In stock only',
  'catalog.clear': 'Clear filters', 'catalog.sort': 'Sort', 'sort.relevance': 'Best match', 'sort.name': 'Name',
  'sort.price_asc': 'Price: low to high', 'sort.price_desc': 'Price: high to low', 'sort.newest': 'Newest',
  'catalog.empty': 'No products match these filters', 'catalog.empty_hint': 'Change the search or clear the filters.',
  'catalog.error': 'The catalog did not load', 'catalog.retry': 'Try again', 'catalog.prev': 'Previous', 'catalog.next': 'Next',
  'catalog.page': 'Page {page} of {pages}', 'catalog.filters': 'Filters',
  'product.in_stock': 'In stock', 'product.low_stock': 'Only {count} left', 'product.out_of_stock': 'Out of stock',
  'product.add': 'Add to cart', 'product.added': 'In cart', 'product.wholesale': 'Wholesale price', 'product.retail_was': 'Retail: {price}',
  'product.sku': 'Code', 'product.barcode': 'Barcode', 'product.unit': 'Unit', 'product.category': 'Category',
  'product.back': 'Back to catalog', 'product.not_found': 'Product not found', 'product.quantity': 'Quantity',
  'wishlist.add': 'Add to wishlist', 'wishlist.remove': 'Remove from wishlist', 'wishlist.title': 'Wishlist', 'wishlist.empty': 'Your wishlist is empty',
  'cart.title': 'Cart', 'cart.empty': 'Your cart is empty', 'cart.continue': 'Continue shopping', 'cart.subtotal': 'Items',
  'cart.shipping': 'Delivery', 'cart.free_shipping_left': '{amount} more for free delivery', 'cart.free_shipping_reached': 'Delivery is free',
  'cart.checkout': 'Checkout', 'cart.remove': 'Remove', 'cart.unavailable': 'Only {count} available', 'cart.close': 'Close',
  'checkout.title': 'Checkout', 'checkout.contact': 'Contact details', 'checkout.name': 'Full name', 'checkout.phone': 'Phone',
  'checkout.email': 'Email', 'checkout.delivery': 'Delivery', 'checkout.express': 'Delivery', 'checkout.express_hint': '2,500 AMD, free from 50,000 AMD',
  'checkout.pickup': 'Store pickup', 'checkout.pickup_hint': 'Free, Yerevan', 'checkout.city': 'City', 'checkout.address': 'Address',
  'checkout.payment': 'Payment', 'checkout.card': 'Card', 'checkout.cash': 'Cash on delivery', 'checkout.invoice': 'Invoice (B2B)',
  'checkout.invoice_hint': 'Pay within {days} days', 'checkout.notes': 'Notes', 'checkout.summary': 'Your order', 'checkout.total': 'Total',
  'checkout.place': 'Place order', 'checkout.placing': 'Placing order…', 'checkout.shortage': 'Some items are no longer available in that quantity:',
  'checkout.shortage_line': '{name}: requested {requested}, available {available}', 'checkout.error': 'The order was not placed. Your cart is saved.',
  'checkout.success_title': 'Thank you, your order is in', 'checkout.success_number': 'Order number: {number}', 'checkout.success_hint': 'We will call you to confirm.',
  'auth.signin': 'Sign in', 'auth.register': 'Create account', 'auth.email': 'Email', 'auth.password': 'Password', 'auth.password_hint': 'At least 10 characters, letters and digits',
  'auth.individual': 'Individual', 'auth.company': 'Company', 'auth.first_name': 'First name', 'auth.last_name': 'Last name', 'auth.phone': 'Phone',
  'auth.company_name': 'Company name', 'auth.tax_id': 'Tax ID (ՀՎՀՀ)', 'auth.tax_id_hint': '8 digits', 'auth.tax_id_invalid': 'The tax ID must be exactly 8 digits',
  'auth.contact_person': 'Contact person', 'auth.company_note': 'Wholesale prices and invoice payment unlock once we verify your company.',
  'auth.submit_signin': 'Sign in', 'auth.submit_register': 'Create account', 'auth.no_account': 'No account yet?', 'auth.have_account': 'Already registered?',
  'auth.error': 'That did not work. Check your details.',
  'account.title': 'Account', 'account.profile': 'Profile', 'account.orders': 'Orders', 'account.no_orders': 'No orders yet', 'account.signout': 'Sign out',
  'account.b2b_active': 'B2B account: wholesale prices and invoice payment', 'account.b2b_pending': 'We are verifying your company. Retail prices apply until then.',
  'account.order_items': '{count} units', 'account.back_to_orders': 'All orders',
  'order.status.pending': 'Received', 'order.status.confirmed': 'Confirmed', 'order.status.shipped': 'On the way', 'order.status.delivered': 'Delivered', 'order.status.cancelled': 'Cancelled',
  'order.due': 'Payment due {date}', 'common.loading': 'Loading…', 'common.close': 'Close', 'common.network': 'Cannot reach the server. Please try again.',
  'footer.rights': 'All rights reserved', 'footer.photo_note': 'Product photos: the store',
};

const DICTIONARIES: Record<Lang, Dictionary> = { hy, ru, en };
const STORAGE_KEY = 'suro_lang';

export type T = (key: Key, params?: Record<string, string | number>) => string;

interface I18n {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: T;
  /** "4 500 ֏" (hy) or "4 500 AMD" (ru/en). */
  money: (value: string | number | null | undefined) => string;
  unit: (unit: string) => string;
  category: (slug: string, fallback: string) => string;
  city: string;
}

const I18nContext = createContext<I18n | null>(null);

function initialLang(): Lang {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && (LANGS as string[]).includes(saved)) return saved as Lang;
  } catch {
    // storage unavailable
  }
  return 'hy';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // storage unavailable
    }
  }, []);

  const t = useCallback<T>(
    (key, params) => {
      let text = DICTIONARIES[lang][key] ?? hy[key] ?? key;
      for (const [name, value] of Object.entries(params ?? {})) text = text.split(`{${name}}`).join(String(value));
      return text;
    },
    [lang],
  );

  const value = useMemo(
    () => ({
      lang,
      setLang,
      t,
      money: (v: string | number | null | undefined) => formatMoney(v, lang),
      unit: (u: string) => unitLabel(u, lang),
      category: (slug: string, fallback: string) => categoryName(slug, lang, fallback),
      city: cityName(lang),
    }),
    [lang, setLang, t],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
