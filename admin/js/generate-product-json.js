(function() {
  var isNode = typeof module !== 'undefined' && module.exports;

  if (isNode) {
    var fs = require('fs');
    var path = require('path');

    module.exports = {
      generateProductJson: generateProductJsonNode
    };

    if (require.main === module) {
      generateProductJsonNode({
        repoRoot: path.resolve(__dirname, '../..'),
        log: function(message) {
          process.stdout.write(message + '\n');
        }
      }).catch(function(error) {
        process.stderr.write((error && error.stack ? error.stack : String(error)) + '\n');
        process.exitCode = 1;
      });
    }

    return;
  }

  var display = document.getElementById('admin-display');
  var generateNavButton = document.getElementById('generate-product-json');
  var navButtons = Array.prototype.slice.call(document.querySelectorAll('[data-view]'));
  var outputNode = null;
  var viewStorageKey = 'yiichen-admin-active-view';
  var outputStorageKey = 'yiichen-admin-generate-output';

  if (!display || !generateNavButton) return;

  navButtons.forEach(function(button) {
    button.addEventListener('click', function() {
      showView(button.getAttribute('data-view'));
    });
  });

  showView(localStorage.getItem(viewStorageKey) || 'home');

  function showView(viewName) {
    localStorage.setItem(viewStorageKey, viewName);

    navButtons.forEach(function(button) {
      button.classList.toggle('is-active', button.getAttribute('data-view') === viewName);
    });

    if (viewName === 'generate-product-json') {
      renderGenerateView();
      return;
    }

    renderHomeView();
  }

  function renderHomeView() {
    outputNode = null;
    display.innerHTML = '<div class="admin-home" aria-label="Dashboard home"></div>';
  }

  function renderGenerateView() {
    display.innerHTML = [
      '<div class="generate-product-json-view">',
      '  <section class="terminal-panel" aria-label="Generate Product JSON terminal">',
      '    <div class="terminal-titlebar">Product Folder: ../docs/product-data</div>',
      '    <pre class="terminal-output" id="generate-product-json-output"></pre>',
      '  </section>',
      '  <button class="admin-button generate-button" type="button" id="generate-product-json-run">Generate</button>',
      '</div>'
    ].join('');

    outputNode = document.getElementById('generate-product-json-output');
    setOutput(localStorage.getItem(outputStorageKey) || 'Ready...');
    document.getElementById('generate-product-json-run').addEventListener('click', runGenerate);
  }

  function setOutput(message) {
    if (!outputNode) return;
    outputNode.textContent = message || '';
    localStorage.setItem(outputStorageKey, outputNode.textContent);
    outputNode.scrollTop = outputNode.scrollHeight;
  }

  function runGenerate(event) {
    var button = event.currentTarget;
    var intro = 'Connecting [ ' + getGenerateApiUrl() + ' ]\nFetching [ ../docs/product-data ]\n\n';

    button.disabled = true;
    setOutput(intro);

    postJson(getGenerateApiUrl())
      .then(function(payload) {
        var log = payload.log || 'Success!';
        var done = '\n\nCompleted at ' + formatTimestamp(new Date());

        setOutput(log + done);
      })
      .catch(function(error) {
        setOutput('Error:\n' + (error && error.message ? error.message : String(error)) + '\n\nCompleted at ' + formatTimestamp(new Date()));
      })
      .finally(function() {
        button.disabled = false;
      });
  }

  function formatTimestamp(date) {
    return [
      date.getFullYear(),
      padTime(date.getMonth() + 1),
      padTime(date.getDate())
    ].join('-') + ' ' + [
      padTime(date.getHours()),
      padTime(date.getMinutes()),
      padTime(date.getSeconds())
    ].join(':');
  }

  function padTime(value) {
    return String(value).padStart(2, '0');
  }

  function getGenerateApiUrl() {
    return 'http://127.0.0.1:8790/api/generate-product-json';
  }

  function postJson(url) {
    return new Promise(function(resolve, reject) {
      var request = new XMLHttpRequest();

      request.open('POST', url, true);
      request.setRequestHeader('Accept', 'application/json');

      request.onload = function() {
        var payload = null;

        try {
          payload = request.responseText ? JSON.parse(request.responseText) : null;
        } catch (error) {
          reject(new Error('Server returned a non-JSON response: ' + request.responseText.slice(0, 180)));
          return;
        }

        if (request.status < 200 || request.status >= 300) {
          reject(new Error(payload && payload.error ? payload.error : 'Generate failed with HTTP ' + request.status));
          return;
        }

        resolve(payload || {});
      };

      request.onerror = function() {
        reject(new Error('Cannot reach admin server at ' + url));
      };

      request.send();
    });
  }

})();

async function generateProductJsonNode(options) {
  var fs = require('fs');
  var path = require('path');
  var repoRoot = options.repoRoot;
  var log = options.log || function() {};
  var productDataDir = path.join(repoRoot, 'docs/product-data');
  var categoryIndexPath = path.join(productDataDir, 'index.json');

  log('Fetching [ ../docs/product-data ]');

  var categoryIndex = await readJson(categoryIndexPath);
  var categoryFolders = await listDirectories(productDataDir, /^c-\d+$/);
  var categoryByPath = {};

  categoryIndex.forEach(function(category) {
    if (category && category.category_path) {
      categoryByPath[category.category_path] = category;
    }
  });

  log('Found:');
  categoryFolders.forEach(function(categoryFolder) {
    var category = categoryByPath[categoryFolder] || {};
    log(categoryFolder + ': ' + (category.label || 'Untitled'));
  });

  log('');
  log('Fetching [ ../docs/product-data/' + summarizeRange(categoryFolders) + ' ]');
  log('Found:');

  var searchIndex = [];
  var categoriesWritten = [];

  for (var categoryIndexNumber = 0; categoryIndexNumber < categoryFolders.length; categoryIndexNumber += 1) {
    var categoryFolder = categoryFolders[categoryIndexNumber];
    var categoryDir = path.join(productDataDir, categoryFolder);
    var productFolders = await listDirectories(categoryDir, /^\d+$/);
    var categoryProducts = [];

    for (var productIndex = 0; productIndex < productFolders.length; productIndex += 1) {
      var productFolder = productFolders[productIndex];
      var productDir = path.join(categoryDir, productFolder);
      var productJsonPath = path.join(productDir, 'index.json');
      var product = await readJson(productJsonPath);
      var productId = getProductId(categoryFolder, productFolder, product);
      var publicId = categoryFolder + '-' + productFolder;
      var displayName = product.name || 'Untitled';
      var images = await scanProductImages(productDir);
      var thumbnail = images[0] || 'images/1.jpg';
      var thumbnail2 = images[1] || 'images/2.jpg';

      delete product.img;
      product.images = images;
      await writeJson(productJsonPath, product);

      log(publicId + ': ' + displayName);
      log(publicId + ' images: ' + images.length + (images.length ? ' [' + images.join(', ') + ']' : ''));

      categoryProducts.push({
        id: productId,
        product_id: productId,
        product_folder: productFolder,
        name: product.name || '',
        subtitle: product.subtitle || '',
        price: product.price || '',
        currency: product.currency || '',
        size: product.size || '',
        thumbnail: productFolder + '/' + thumbnail,
        thumbnail2: productFolder + '/' + thumbnail2
      });

      searchIndex.push({
        id: productId,
        product_id: productId,
        category: categoryFolder,
        product_folder: productFolder,
        name: product.name || '',
        price: product.price || '',
        currency: product.currency || '',
        size: product.size || '',
        keywords: buildKeywords(product),
        thumbnail: categoryFolder + '/' + productFolder + '/' + thumbnail
      });
    }

    await writeJson(path.join(categoryDir, 'index.json'), categoryProducts);
    categoriesWritten.push(categoryFolder);
  }

  log('...');
  log('Writing " Search Index " at [ ../docs/product-data/search-index.json ]');
  await writeJson(path.join(productDataDir, 'search-index.json'), searchIndex);
  log('Success!');

  log('');
  log('Writing " Category Index " at [ ../docs/product-data/' + summarizeRange(categoriesWritten) + ' ]');
  log('Success!');

  return {
    categories: categoryFolders.length,
    products: searchIndex.length
  };
}

async function readJson(filePath) {
  var fs = require('fs');
  var content = await fs.promises.readFile(filePath, 'utf8');
  return JSON.parse(content);
}

async function writeJson(filePath, data) {
  var fs = require('fs');
  await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2) + '\n');
}

async function listDirectories(dirPath, pattern) {
  var fs = require('fs');
  var entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

  return entries
    .filter(function(entry) {
      return entry.isDirectory() && pattern.test(entry.name);
    })
    .map(function(entry) {
      return entry.name;
    })
    .sort(compareNatural);
}

async function scanProductImages(productDir) {
  var fs = require('fs');
  var path = require('path');
  var imageDir = path.join(productDir, 'images');
  var imagePattern = /\.(avif|webp|jpg|jpeg|png|gif)$/i;

  try {
    var entries = await fs.promises.readdir(imageDir, { withFileTypes: true });
    return entries
      .filter(function(entry) {
        return entry.isFile() && imagePattern.test(entry.name);
      })
      .map(function(entry) {
        return entry.name;
      })
      .sort(compareNatural)
      .map(function(fileName) {
        return 'images/' + fileName;
      });
  } catch (error) {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  }
}

function getProductId(categoryFolder, productFolder, product) {
  return product.product_id || product.id || categoryFolder + '-' + productFolder;
}

function buildKeywords(product) {
  var keywords = [];

  addKeywordSource(keywords, product.name);

  if (Array.isArray(product.keywords)) {
    product.keywords.forEach(function(keyword) {
      addKeywordSource(keywords, keyword);
    });
  } else if (typeof product.keywords === 'string') {
    addKeywordSource(keywords, product.keywords);
  }

  return unique(keywords);
}

function addKeywordSource(target, value) {
  if (!value) return;

  String(value).split(/[^A-Za-z0-9]+/).forEach(function(part) {
    var keyword = part.trim().toLowerCase();
    if (keyword) target.push(keyword);
  });
}

function unique(items) {
  var seen = {};

  return items.filter(function(item) {
    if (seen[item]) return false;
    seen[item] = true;
    return true;
  });
}

function compareNatural(a, b) {
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

function summarizeRange(items) {
  if (!items.length) return '';
  if (items.length === 1) return items[0];
  return items[0] + '...' + items[items.length - 1];
}
