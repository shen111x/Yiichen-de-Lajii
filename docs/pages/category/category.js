(function() {
var categoryProductDataIndexPath = '../../product-data/index.json';

function initCategoryPageData() {
  var title = document.getElementById('category-hero-title');
  var bodycopy = document.getElementById('category-hero-body-copy');
  var image = document.getElementById('category-hero-image');

  if (!title && !bodycopy && !image) return;

  fetch(categoryProductDataIndexPath)
    .then(function(response) {
      if (!response.ok) {
        throw new Error(response.status + ' ' + response.statusText);
      }

      return response.json();
    })
    .then(function(categories) {
      var category = getCurrentCategoryData(categories);

      if (!category) return;

      renderCategoryPageData(category, title, bodycopy, image);
    })
    .catch(function(error) {
      console.error('加载 category page 数据失败：', error);
    });
}

function getCurrentCategoryData(categories) {
  var currentUrl = new URL(window.location.href);
  var currentCategory = currentUrl.searchParams.get('c') ||
    currentUrl.searchParams.get('category') ||
    currentUrl.searchParams.get('categoryId') ||
    '';

  if (!Array.isArray(categories) || !categories.length) return null;

  if (!currentCategory) return categories[0];

  return categories.find(function(category) {
    var categoryId = category.category_id || category.id || '';
    var categoryPath = category.category_path || category.path || '';

    return normalizeCategoryToken(categoryId) === normalizeCategoryToken(currentCategory) ||
      categoryPath === currentCategory;
  }) || null;
}

function renderCategoryPageData(category, title, bodycopy, image) {
  var subtext = category.sub_text ||
    category.subtext ||
    category.bodycopy ||
    category.bodyCopy ||
    category.description ||
    '';

  if (title) title.textContent = category.label || '';
  if (bodycopy && subtext) bodycopy.textContent = subtext;

  var categoryPath = category.category_path || category.path || '';

  if (image && categoryPath) {
    image.src = '../../product-data/' + categoryPath + '/1.jpg';
    image.alt = category.label || '';
  }
}

function normalizeCategoryToken(value) {
  var text = String(value || '').trim();

  if (/^[0-9]+$/.test(text)) {
    return String(parseInt(text, 10)).padStart(2, '0');
  }

  return text;
}

initCategoryPageData();
})();
