/**
 * This file is part of Adguard Browser Extension (https://github.com/AdguardTeam/AdguardBrowserExtension).
 *
 * Adguard Browser Extension is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Adguard Browser Extension is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with Adguard Browser Extension.  If not, see <http://www.gnu.org/licenses/>.
 */

/**
 * Initializing required libraries for this file.
 * require method is overridden in Chrome extension (port/require.js).
 */
var StringUtils = require('../../../lib/utils/common').StringUtils;
var FilterRule = require('../../../lib/filter/rules/base-filter-rule').FilterRule;

/**
 * CSS rule.
 *
 * Read here for details:
 * http://adguard.com/en/filterrules.html#hideRules
 * http://adguard.com/en/filterrules.html#cssInjection
 */
var CssFilterRule = exports.CssFilterRule = (function () {
    /**
     * The problem with pseudo-classes is that any unknown pseudo-class makes browser ignore the whole CSS rule,
     * which contains a lot more selectors. So, if CSS selector contains a pseudo-class, we should try to validate it.
     * <p>
     * One more problem with pseudo-classes is that they are actively used in uBlock, hence it may mess AG styles.
     */
    var SUPPORTED_PSEUDO_CLASSES = [":active",
        ":checked", ":disabled", ":empty", ":enabled", ":first-child", ":first-of-type",
        ":focus", ":hover", ":in-range", ":invalid", ":lang", ":last-child", ":last-of-type",
        ":link", ":not", ":nth-child", ":nth-last-child", ":nth-last-of-type", ":nth-of-type",
        ":only-child", ":only-of-type", ":optional", ":out-of-range", ":read-only",
        ":read-write", ":required", ":root", ":target", ":valid", ":visited"];

    /**
     * Tries to convert CSS injections rules from uBlock syntax to our own
     * https://github.com/AdguardTeam/AdguardForAndroid/issues/701
     *
     * @param pseudoClass :style pseudo class
     * @param cssContent  CSS content
     * @return String CSS content if it is a :style rule or null otherwise
     */
    var convertCssInjectionRule = function (pseudoClass, cssContent) {

        var selector = cssContent.substring(0, pseudoClass.nameStartIndex);
        var styleStart = pseudoClass.nameStartIndex + pseudoClass.name.length + 1;
        var styleEnd = cssContent.length - 1;

        if (styleEnd <= styleStart) {
            throw new Error("Empty :style pseudo class: " + cssContent);
        }

        var style = cssContent.substring(styleStart, styleEnd);

        if (StringUtils.isEmpty(selector) || StringUtils.isEmpty(style)) {
            throw new Error("Wrong :style pseudo-element syntax: " + cssContent);
        }

        return selector + " { " + style + " }";
    };

    /**
     * Parses first pseudo class from the specified CSS selector
     *
     * @param selector
     * @returns {*} first PseudoClass found or null
     */
    var parsePseudoClass = function (selector) {
        var nameStartIndex = selector.indexOf(':');
        if (nameStartIndex < 0) {
            return null;
        }

        if (nameStartIndex > 0 && selector.charAt(nameStartIndex - 1) == '\\') {
            // Escaped colon character
            return null;
        }

        var squareBracketIndex = selector.indexOf('[');
        if (squareBracketIndex >= 0 && nameStartIndex > squareBracketIndex) {
            // Means that colon character is somewhere inside attribute selector
            // Something like a[src^="http://domain.com"]
            return null;
        }

        var nameEndIndex = StringUtils.indexOfAny(selector, nameStartIndex + 1, [' ', '\t', '>', '(', '[', '.', '#', ':']);
        if (nameEndIndex < 0) {
            nameEndIndex = selector.length;
        }

        var name = selector.substring(nameStartIndex, nameEndIndex);
        if (name.length <= 1) {
            // Either empty name or a pseudo element (like ::content)
            return null;
        }

        return {
            name: name,
            nameStartIndex: nameStartIndex,
            nameEndIndex: nameEndIndex
        };
    };

    var constructor = function (rule, filterId) {

        FilterRule.call(this, rule, filterId);

        var isInjectRule = StringUtils.contains(rule, FilterRule.MASK_CSS_INJECT_RULE) || StringUtils.contains(rule, FilterRule.MASK_CSS_EXCEPTION_INJECT_RULE);
        if (isInjectRule) {
            this.isInjectRule = isInjectRule;
        }

        var mask;
        if (isInjectRule) {
            this.whiteListRule = StringUtils.contains(rule, FilterRule.MASK_CSS_EXCEPTION_INJECT_RULE);
            mask = this.whiteListRule ? FilterRule.MASK_CSS_EXCEPTION_INJECT_RULE : FilterRule.MASK_CSS_INJECT_RULE;
        } else {
            this.whiteListRule = StringUtils.contains(rule, FilterRule.MASK_CSS_EXCEPTION_RULE);
            mask = this.whiteListRule ? FilterRule.MASK_CSS_EXCEPTION_RULE : FilterRule.MASK_CSS_RULE;
        }

        var indexOfMask = rule.indexOf(mask);
        if (indexOfMask > 0) {
            // domains are specified, parsing
            var domains = rule.substring(0, indexOfMask);
            this.loadDomains(domains);
        }

        var cssContent = rule.substring(indexOfMask + mask.length);

        if (!isInjectRule) {
            var pseudoClass = parsePseudoClass(cssContent);
            if (pseudoClass != null && ":style" == pseudoClass.name) {
                isInjectRule = true;
                cssContent = convertCssInjectionRule(pseudoClass, cssContent);
            } else if (pseudoClass != null && SUPPORTED_PSEUDO_CLASSES.indexOf(pseudoClass.name) < 0) {
                throw new Error("Unknown pseudo class: " + cssContent);
            }
        }

        this.isInjectRule = isInjectRule;
        this.cssSelector = cssContent;
    };

    return constructor;
})();

CssFilterRule.prototype = Object.create(FilterRule.prototype);