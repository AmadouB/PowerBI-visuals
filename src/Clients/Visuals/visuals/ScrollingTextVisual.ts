/*
 *  Power BI Visualizations
 *
 *  Copyright (c) Microsoft Corporation
 *  All rights reserved. 
 *  MIT License
 *
 *  Permission is hereby granted, free of charge, to any person obtaining a copy
 *  of this software and associated documentation files (the ""Software""), to deal
 *  in the Software without restriction, including without limitation the rights
 *  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *  copies of the Software, and to permit persons to whom the Software is
 *  furnished to do so, subject to the following conditions:
 *   
 *  The above copyright notice and this permission notice shall be included in 
 *  all copies or substantial portions of the Software.
 *   
 *  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR 
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE 
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 *  THE SOFTWARE.
 */

/*
Created by Fredrik Hedenström, 2015-09-08
*/

/// <reference path="../_references.ts"/>

module powerbi.visuals {
    import DataRoleHelper = powerbi.data.DataRoleHelper;

    export interface CategoryViewModel {
        value: string;
        identity: string;
        color: string;
    }

    export interface TextCategory {
        txtCategory: string;
        txtDataAbsoluteFormatted: string;
        txtDataRelativeFormatted: string;
        txtSplitChar: string;
        txtSeparator: string;
        colText: string;
        colStatus: string;
        posX: number;
        svgSel: D3.Selection;
        sCategory: D3.Selection;
        sDataAbsoluteFormatted: D3.Selection;
        sDataRelativeFormatted: D3.Selection;
        sSplitChar: D3.Selection;
        sSeparator: D3.Selection;
        actualWidth: number;
    }

    export interface ValueViewModel {
        values: any[];
    }

    export interface ViewModel {
        categories: CategoryViewModel[];
        values: ValueViewModel[];
    }

    export class ScrollingTextVisual implements IVisual {
        public static capabilities: VisualCapabilities = {
            // This is what will appear in the 'Field Wells' in reports
            dataRoles: [
                {
                    name: 'Category',
                    kind: powerbi.VisualDataRoleKind.Grouping,
                },
                {
                    name: 'Measure Absolute',
                    kind: powerbi.VisualDataRoleKind.Measure,
                    displayName: 'Current Value'
                },
                {
                    name: 'Measure Deviation',
                    kind: powerbi.VisualDataRoleKind.Measure,
                    displayName: 'Deviation Value'
                }
            ],
            // This tells power bi how to map your roles above into the dataview you will receive
            dataViewMappings: [{
                conditions: [
                    { 'Category': { max: 1 }, 'Measure Absolute': { max: 1 }, 'Measure Deviation': { max: 1 } },
                ],
                categorical: {
                    categories: {
                        for: { in: 'Category' },
                        dataReductionAlgorithm: { top: {} }
                    },

                    values: {
                        group: {
                            by: 'Series',
                            select: [{ bind: { to: 'Measure Absolute' } }, { bind: { to: 'Measure Deviation' } }],
                            dataReductionAlgorithm: { top: {} }
                        }
                    },
                    rowCount: { preferred: { min: 1 } }

                }
            }],
            sorting: {
                default: {},
            },            
            // Objects light up the formatting pane
            objects: {
                scroller: {
                    displayName: "Scroller",
                    properties: {
                        formatString: {
                            type: { formatting: { formatString: true } },
                        },
                        pShouldAutoSizeFont: {
                            displayName: "Auto-size font",
                            type: { bool: true }
                        },
                        pShouldIndicatePosNeg: {
                            displayName: "Status indicator",
                            type: { bool: true }
                        },
                        pShouldUsePosNegColoring: {
                            displayName: "Status indicator coloring",
                            type: { bool: true }
                        },
                        pShouldUseTextColoring: {
                            displayName: "Status text coloring",
                            type: { bool: true }
                        },

                        pFontSize: {
                            displayName: "Font size (if not auto-size)",
                            type: { numeric: true }
                        },
                        pSpeed: {
                            displayName: "Scroll speed",
                            type: { numeric: true }
                        },
                        pForeColor: {
                            displayName: "Text color",
                            type: { fill: { solid: { color: true } } }
                        },
                        pBgColor: {
                            displayName: "Background color",
                            type: { fill: { solid: { color: true } } }
                        },
                        pCustomText: {
                            displayName: "Custom Text",
                            type: { text: true }
                        },
                        pInterval: {
                            displayName: "Update interval",
                            type: { numeric: true }
                        },
                    },
                    general: {
                        displayName: data.createDisplayNameGetter('Visual_General'),
                        properties: {
                            formatString: {
                                type: { formatting: { formatString: true } },
                            }
                        },
                    }

                }
            }
        };

        public static getMetaDataColumn(dataView: DataView) {
            if (dataView && dataView.metadata && dataView.metadata.columns) {
                for (var i = 0, ilen = dataView.metadata.columns.length; i < ilen; i++) {
                    var column = dataView.metadata.columns[i];
                    if (column.isMeasure) {
                        return column;
                    }
                }
            }
            return null;
        }

        public static converter(dataView: DataView, colors: IDataColorPalette, thisRef: ScrollingTextVisual): ViewModel {
            var viewModel: ViewModel = {
                categories: [],
                values: []
            };
            
            // This is necessary for backward compatability with Power BI Desktop client Dec 2015
            // and Jan 2016. 
            if (DataRoleHelper === undefined) {
                DataRoleHelper = powerbi.visuals.DataRoleHelper;
            }

            if (dataView) {
                var categorical = dataView.categorical;
                if (categorical && categorical.values) {
                    var categories = categorical.categories;
                    var series = categorical.values;

                    var group = categorical.values.grouped();

                    thisRef.measure0Index = DataRoleHelper.getMeasureIndexOfRole(group, "Measure Absolute");
                    thisRef.measure1Index = DataRoleHelper.getMeasureIndexOfRole(group, "Measure Deviation");

                    if (thisRef.measure0Index === -1 && thisRef.measure1Index === -1) {
                        // Maybe we are debuging another dataset that does not have the measure we are after
                        if (series.length > 0)
                            thisRef.measure0Index = 0;
                        if (series.length > 1)
                            thisRef.measure1Index = 1;
                    }

                    if (thisRef.measure0Index < 0 && thisRef.measure1Index < 0) {
                        return;
                    }

                    thisRef.measure0FormatString = thisRef.measure0Index >= 0 ? group[0].values[thisRef.measure0Index].source.format : "";
                    thisRef.measure1FormatString = thisRef.measure1Index >= 0 ? group[0].values[thisRef.measure1Index].source.format : "";

                    if (categories && series && categories.length > 0 && series.length > 0) {
                        for (var i = 0, catLength = categories[0].values.length; i < catLength; i++) {
                            viewModel.categories.push({
                                color: colors.getColorByIndex(1).value, // i
                                value: categories[0].values[i],
                                identity: ''
                            });

                            for (var k = 0, seriesLength = series.length; k < seriesLength; k++) {
                                var value = series[k].values[i];
                                if (k === 0) {
                                    viewModel.values.push({ values: [] });
                                }
                                viewModel.values[i].values.push(value);
                            }
                        }
                    }
                }
            }
            return viewModel;
        }

        private hostContainer: JQuery;
        private colorPalette: IDataColorPalette;

        private svg: D3.Selection;
        private dataView: DataView;
        private rect: D3.Selection;
        private sText: D3.Selection;

        private static properties = {
            pShouldAutoSizeFont: { objectName: 'scroller', propertyName: 'pShouldAutoSizeFont' },
            pShouldIndicatePosNeg: { objectName: 'scroller', propertyName: 'pShouldIndicatePosNeg' },
            pShouldUsePosNegColoring: { objectName: 'scroller', propertyName: 'pShouldUsePosNegColoring' },
            pShouldUseTextColoring: { objectName: 'scroller', propertyName: 'pShouldUseTextColoring' },
            pFontSize: { objectName: 'scroller', propertyName: 'pFontSize' },
            pSpeed: { objectName: 'scroller', propertyName: 'pSpeed' },
            pCustomText: { objectName: 'scroller', propertyName: 'pCustomText' },
            pForeColor: { objectName: 'scroller', propertyName: 'pForeColor' },
            pBgColor: { objectName: 'scroller', propertyName: 'pBgColor' },
            pInterval: { objectName: 'scroller', propertyName: 'pInterval' },
        };
        private pShouldAutoSizeFont_get(dataView: DataView): boolean { return dataView == null ? false : DataViewObjects.getValue(dataView.metadata.objects, ScrollingTextVisual.properties.pShouldAutoSizeFont, false); }
        private pShouldIndicatePosNeg_get(dataView: DataView): boolean { return dataView == null ? true : DataViewObjects.getValue(dataView.metadata.objects, ScrollingTextVisual.properties.pShouldIndicatePosNeg, true); }
        private pShouldUsePosNegColoring_get(dataView: DataView): boolean { return dataView == null ? true : DataViewObjects.getValue(dataView.metadata.objects, ScrollingTextVisual.properties.pShouldUsePosNegColoring, true); }
        private pShouldUseTextColoring_get(dataView: DataView): boolean { return dataView == null ? false : DataViewObjects.getValue(dataView.metadata.objects, ScrollingTextVisual.properties.pShouldUseTextColoring, false); }
        private pFontSize_get(dataView: DataView): number { return dataView == null ? 20 : DataViewObjects.getValue(dataView.metadata.objects, ScrollingTextVisual.properties.pFontSize, 20); }
        private pSpeed_get(dataView: DataView): number { return dataView == null ? 1.2 : DataViewObjects.getValue(dataView.metadata.objects, ScrollingTextVisual.properties.pSpeed, 1.2); }
        private pCustomText_get(dataView: DataView): string { return dataView == null ? "" : DataViewObjects.getValue(dataView.metadata.objects, ScrollingTextVisual.properties.pCustomText, ""); }
        private pForeColor_get(dataView: DataView): Fill { return dataView == null ? { solid: { color: '#ffffff' } } : DataViewObjects.getValue(dataView.metadata.objects, ScrollingTextVisual.properties.pForeColor, { solid: { color: '#ffffff' } }); }
        private pBgColor_get(dataView: DataView): Fill { return dataView == null ? { solid: { color: '#000000' } } : DataViewObjects.getValue(dataView.metadata.objects, ScrollingTextVisual.properties.pBgColor, { solid: { color: '#000000' } }); }
        private pInterval_get(dataView: DataView): number { return dataView == null ? 50 : DataViewObjects.getValue(dataView.metadata.objects, ScrollingTextVisual.properties.pInterval, 50); }

        private activeSpeed: number = 0;
        private activeFontSize: number = 0;
        private activeTargetSpeed: number = 0;
        private totalTextWidth: number = 1000;
        private viewportWidth: number = 1000;
        private viewportHeight: number = 1000;
        private measure0Index = 0;
        private measure1Index = 1;
        private measure0FormatString = "";
        private measure1FormatString = "";
        private intervalFunc: any = null;
        private gPosX: number = 0;
 
        /** This is called once when the visual is initialially created */
        public init(options: VisualInitOptions): void {
            this.colorPalette = options.style.colorPalette.dataColors;
            // element is the element in which your visual will be hosted.
            this.hostContainer = options.element.css('overflow-x', 'hidden');

            options.element.empty();

            this.svg = d3.select(options.element.get(0)).append("svg");

            var that = this;

            this.rect = this.svg.append("rect")
                .on("mouseover", function () {
                    that.activeTargetSpeed = 0;
                })
                .on("mouseout", function () {
                    that.activeTargetSpeed = that.pSpeed_get(that.dataView);
                });

            this.sText = this.svg.append("text");
        }

        public UpdateTextIntervals() {
            for (var i = 0; i < this.arrTextCategories.length; i++) {
                var s: TextCategory = this.arrTextCategories[i];
                if (s.svgSel == null) {
                    // Create element (it's within the viewport)
                    if (s.posX < this.viewportWidth) {
                        var bShouldRenderAbsolute = this.measure0Index >= 0 ? true : false;
                        var bShouldRenderRelative = this.measure1Index >= 0 ? true : false;

                        var y = this.viewportHeight * 0.5 + this.activeFontSize * 0.30;

                        s.svgSel = this.svg.append("text").attr("x", s.posX);
                        s.svgSel.attr("font-family", "Lucida Console").attr("font-size", this.activeFontSize + "px");

                        var that = this;
                        s.svgSel
                            .on("mouseover", function () {
                                that.activeTargetSpeed = 0;
                            })
                            .on("mouseout", function () {
                                that.activeTargetSpeed = that.pSpeed_get(that.dataView);
                            });

                        s.sCategory = s.svgSel.append("tspan")
                            .text(s.txtCategory + " ")
                            .attr("y", y)
                            .style("fill", s.colText)
                        ;

                        if (bShouldRenderAbsolute) {
                            s.sDataAbsoluteFormatted = s.svgSel.append("tspan")
                                .text(s.txtDataAbsoluteFormatted)
                                .attr("y", y)
                                .style("fill", s.colText)
                            ;

                            s.sSplitChar = s.svgSel.append("tspan")
                                .text(s.txtSplitChar)
                                .attr("y", y)
                                .style("fill", s.colStatus)
                            ;
                        }
                        if (bShouldRenderRelative) {
                            s.sSplitChar = s.svgSel.append("tspan")
                                .text(s.txtDataRelativeFormatted)
                                .attr("y", y)
                                .style("fill", s.colText)
                            ;
                        }

                        s.sSplitChar = s.svgSel.append("tspan")
                            .text(s.txtSeparator)
                            .attr("y", y)
                            .style("fill", this.pBgColor_get(this.dataView).solid.color)
                        ;

                        s.svgSel.each(function () {
                            s.actualWidth = this.getBBox().width;
                        });

                        if (i > 0) {
                            var sPrev: TextCategory = this.arrTextCategories[i - 1];
                            s.posX = sPrev.posX + sPrev.actualWidth;
                        }
                        // Uppdatera alla efterliggande med den nyligen tillagdas position och bredd.
                        if (i < this.arrTextCategories.length - 1) {
                            for (var t = i + 1; t < this.arrTextCategories.length; t++) {
                                var sNext: TextCategory = this.arrTextCategories[t];
                                sNext.posX = s.posX + s.actualWidth;
                            }
                        }
                    }
                }
            }
            this.activeSpeed += (this.activeTargetSpeed - this.activeSpeed) * 0.5;
            this.gPosX -= this.activeSpeed * 8 * this.pInterval_get(this.dataView) / 100;
            if (this.gPosX < -5000) {
                this.gPosX = 0;
            }

            for (var i = 0; i < this.arrTextCategories.length; i++) {
                var s: TextCategory = this.arrTextCategories[i];
                s.posX -= this.activeSpeed * 8 * this.pInterval_get(this.dataView) / 100;
                if (s.svgSel != null) {
                    s.svgSel.attr("x", s.posX);
                }
            }

            // Remove elements outsiide of the left of the viewport
            for (var i = 0; i < this.arrTextCategories.length; i++) {
                var s: TextCategory = this.arrTextCategories[i];

                if ((s.posX + s.actualWidth) < 0) {
                    // Hela elementet är utanför, ta bort det (börja om)
                    var r1: TextCategory = this.arrTextCategories.splice(i, 1)[0];
                    r1.svgSel.remove();
                    r1.svgSel = null;
                    r1.actualWidth = 0;

                    r1.posX = 0;
                    if (this.arrTextCategories.length > 0) {
                        var sLast: TextCategory = this.arrTextCategories[this.arrTextCategories.length - 1];
                        r1.posX = sLast.posX + 10;
                    }
                    else {
                        r1.posX = this.viewportWidth;
                    }
                    if (r1.posX < this.viewportWidth) {
                        r1.posX = this.viewportWidth;
                    }

                    this.arrTextCategories.push(r1);

                    break;
                }
            }
        }

        /** Update is called for data updates, resizes & formatting changes */
        public update(options: VisualUpdateOptions) {
            var dataViews = options.dataViews;
            if (!dataViews) return;

            this.dataView = options.dataViews[0];

            var that = this;
            if (this.intervalFunc != null) {
                clearInterval(this.intervalFunc);
            }
            this.intervalFunc = setInterval(function (e) {
                /*that.sText.attr("x", that.posX);
                that.posX -= that.activeSpeed * 8 * that.pInterval_get(that.dataView) / 100;
                that.activeSpeed += (that.activeTargetSpeed - that.activeSpeed) * 0.5;
                if (that.posX < -that.totalTextWidth) {
                    that.posX = that.viewportWidth;
                } */
                that.UpdateTextIntervals();
            }, this.pInterval_get(this.dataView));

            this.activeTargetSpeed = this.pSpeed_get(this.dataView);

            var width = options.viewport.width;
            var height = options.viewport.height;

            if (width < 0)
                width = 0;
            if (height < 0)
                height = 0;

            this.viewportWidth = width;
            this.viewportHeight = height;

            if (this.pShouldAutoSizeFont_get(this.dataView)) {
                this.activeFontSize = height * 0.5;
            }
            else {
                this.activeFontSize = this.pFontSize_get(this.dataView);
            }

            var viewModel = ScrollingTextVisual.converter(dataViews[0], this.colorPalette, this);

            this.svg
                .attr("width", width)
                .attr("height", height)
            ;

            this.rect
                .attr("x", 0)
                .attr("y", 0)
                .attr("width", width)
                .attr("height", height)
                .attr("fill", this.pBgColor_get(this.dataView).solid.color)
            ;

            this.sText.remove();
            this.sText = this.svg.append("text")
                .on("mouseover", function () {
                    that.activeTargetSpeed = 0;
                })
                .on("mouseout", function () {
                    that.activeTargetSpeed = that.pSpeed_get(that.dataView);
                });

            this.sText
                .attr("y", height * 0.5 + this.activeFontSize * 0.30)
                .attr("font-family", "Lucida Console")
                .attr("font-size", this.activeFontSize + "px")
                .attr("fill", "#ffffff")
            ;
          
            // Create text from data
            this.CreateTextFromData(viewModel, options.dataViews[0]);

            var that = this;
            this.sText.each(function () {
                that.totalTextWidth = this.getBBox().width;
            });
        }

        private arrTextCategories: TextCategory[];

        private CreateTextFromData(viewModel: ViewModel, dataView: DataView) {
            if (this.gPosX === 0) {
                this.gPosX = this.viewportWidth;
            }

            if (this.arrTextCategories != null && this.arrTextCategories.length > 0) {
                for (var i = 0; i < this.arrTextCategories.length; i++) {
                    if (this.arrTextCategories[i].svgSel != null) {
                        this.arrTextCategories[i].svgSel.remove();
                        this.arrTextCategories[i].svgSel = null;
                    }
                }
                this.arrTextCategories.splice(0, this.arrTextCategories.length);
            }

            this.arrTextCategories = [];

            var sText = this.pCustomText_get(this.dataView);
            if (sText.length > 0) {
                // We have a custom text.               
                var newCat: TextCategory = {
                    txtCategory: sText,
                    txtDataAbsoluteFormatted: "",
                    txtDataRelativeFormatted: "",
                    txtSeparator: "",
                    txtSplitChar: "",
                    colStatus: this.pBgColor_get(this.dataView).solid.color,
                    colText: this.pForeColor_get(this.dataView).solid.color,
                    posX: this.viewportWidth + 10,
                    svgSel: null,
                    sCategory: null,
                    sDataAbsoluteFormatted: null,
                    sDataRelativeFormatted: null,
                    sSeparator: null,
                    sSplitChar: null,
                    actualWidth: 0
                };
                newCat.posX = this.gPosX;
                this.arrTextCategories.push(newCat);
                return;
            }

            for (var i = 0; i < viewModel.categories.length; i++) {
                var category = viewModel.categories[i].value;

                var bShouldRenderAbsolute = this.measure0Index >= 0 ? true : false;
                var bShouldRenderRelative = this.measure1Index >= 0 ? true : false;

                var dataAbsolute, dataAbsoluteFormatted, dataRelative, dataRelativeFormatted;

                if (bShouldRenderAbsolute) {
                    dataAbsolute = viewModel.values[i].values[this.measure0Index];
                    dataAbsoluteFormatted = ScrollingTextVisual.getFormattedValueByFormatString(dataView, dataAbsolute, this.measure0FormatString, this);
                }
                if (bShouldRenderRelative) {
                    dataRelative = viewModel.values[i].values[this.measure1Index];
                    dataRelativeFormatted = ScrollingTextVisual.getFormattedValueByFormatString(dataView, dataRelative, this.measure1FormatString, this);
                }
               
                // Status Color
                var colorStatus = this.pForeColor_get(this.dataView).solid.color;
                var colorText = this.pForeColor_get(this.dataView).solid.color;
                var splitChar = " ";
                if (bShouldRenderRelative && this.pShouldIndicatePosNeg_get(this.dataView)) {
                    if (dataRelative >= 0) {
                        if (this.pShouldUsePosNegColoring_get(this.dataView)) {
                            colorStatus = "#96C401";
                        }
                        if (this.pShouldUseTextColoring_get(this.dataView)) {
                            colorText = "#96C401";
                        }
                        splitChar = " ▲ ";
                    }
                    else {
                        if (this.pShouldUsePosNegColoring_get(this.dataView)) {
                            colorStatus = "#DC0002";
                        }
                        if (this.pShouldUseTextColoring_get(this.dataView)) {
                            colorText = "#DC0002";
                        }
                        splitChar = " ▼ ";
                    }
                }

                var newCat: TextCategory = {
                    txtCategory: category,
                    txtDataAbsoluteFormatted: dataAbsoluteFormatted,
                    txtDataRelativeFormatted: dataRelativeFormatted,
                    txtSeparator: ".....",
                    txtSplitChar: splitChar,
                    colStatus: colorStatus,
                    colText: colorText,
                    posX: this.viewportWidth,
                    svgSel: null,
                    sCategory: null,
                    sDataAbsoluteFormatted: null,
                    sDataRelativeFormatted: null,
                    sSeparator: null,
                    sSplitChar: null,
                    actualWidth: 0
                };
                if (i === 0) {
                    newCat.posX = this.gPosX;
                }
                this.arrTextCategories.push(newCat);
            }
        }

        public static getFormattedValueByFormatString(dataView: DataView, theValue: number, formatString: string, thisRef: ScrollingTextVisual): string {
            thisRef.cardFormatSetting = thisRef.getDefaultFormatSettings();
            var labelSettings = thisRef.cardFormatSetting.labelSettings;
            var isDefaultDisplayUnit = labelSettings.displayUnits === 0;
            var formatter = valueFormatter.create({
                format: formatString,
                value: theValue,
                //                value: labelSettings.displayUnits,
                precision: labelSettings.precision,
                displayUnitSystemType: DisplayUnitSystemType.WholeUnits, // keeps this.displayUnitSystemType as the displayUnitSystemType unless the user changed the displayUnits or the precision
                formatSingleValues: isDefaultDisplayUnit ? true : false,
                allowFormatBeautification: true,
                columnType: undefined
            });
            return formatter.format(theValue);
        }

        public static getFormattedValue(dataView: DataView, theValue: number, measureIndex: number, thisRef: ScrollingTextVisual): string {
            thisRef.getMetaDataColumn(dataView, measureIndex);
            thisRef.cardFormatSetting = thisRef.getDefaultFormatSettings();
            var metaDataColumn = thisRef.metaDataColumn;
            var labelSettings = thisRef.cardFormatSetting.labelSettings;
            var isDefaultDisplayUnit = labelSettings.displayUnits === 0;
            var formatter = valueFormatter.create({
                format: thisRef.getFormatString(metaDataColumn),
                value: labelSettings.displayUnits,
                precision: labelSettings.precision,
                displayUnitSystemType: DisplayUnitSystemType.WholeUnits, // keeps this.displayUnitSystemType as the displayUnitSystemType unless the user changed the displayUnits or the precision
                formatSingleValues: isDefaultDisplayUnit ? true : false,
                allowFormatBeautification: true,
                columnType: metaDataColumn ? metaDataColumn.type : undefined
            });
            return formatter.format(theValue);
        }
        private metaDataColumn: DataViewMetadataColumn;
        private cardFormatSetting: CardFormatSetting;
        public getMetaDataColumn(dataView: DataView, measureIndex: number) {
            var addCol = 0;
            for (var i = 0; i < dataView.metadata.columns.length; i++) {
                if (!dataView.metadata.columns[i].isMeasure)
                    addCol++;
            }

            if (dataView && dataView.metadata && dataView.metadata.columns) {
                var column = dataView.metadata.columns[measureIndex + addCol];
                if (column.isMeasure) {
                    this.metaDataColumn = column;
                }
            }
        }
        public getDefaultFormatSettings(): CardFormatSetting {
            return {
                showTitle: true,
                labelSettings: dataLabelUtils.getDefaultLabelSettings(true, Card.DefaultStyle.value.color), // 0
                wordWrap: false,
                textSize: 12
            };
        }

        public getFormatString(column: DataViewMetadataColumn): string {
            debug.assertAnyValue(column, 'column');
            return valueFormatter.getFormatString(column, AnimatedText.formatStringProp);
        }

        public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstance[] {
            var instances: VisualObjectInstance[] = [];
            var dataView = this.dataView;
            switch (options.objectName) {
                case 'scroller':
                    var general: VisualObjectInstance = {
                        objectName: 'scroller',
                        displayName: 'Scroller',
                        selector: null,
                        properties: {
                            pShouldAutoSizeFont: this.pShouldAutoSizeFont_get(dataView),
                            pShouldIndicatePosNeg: this.pShouldIndicatePosNeg_get(dataView),
                            pShouldUsePosNegColoring: this.pShouldUsePosNegColoring_get(dataView),
                            pShouldUseTextColoring: this.pShouldUseTextColoring_get(dataView),
                            pFontSize: this.pFontSize_get(dataView),
                            pSpeed: this.pSpeed_get(dataView),
                            pCustomText: this.pCustomText_get(dataView),
                            pForeColor: this.pForeColor_get(dataView),
                            pBgColor: this.pBgColor_get(dataView),
                            pInterval: this.pInterval_get(dataView),
                        }
                    };
                    instances.push(general);
                    break;
            }
            return instances;
        }
    }
}