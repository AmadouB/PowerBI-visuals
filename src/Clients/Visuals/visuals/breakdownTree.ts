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

/*
Note from Fredrik Hedenström: this visualization visualizes the whole drilldown path. Since Power BI only provides data for the current drilldown level
it is not possible to provide full cross-filter functionality. Currently, when cross-filtering only the last level is filtered. Maybe this is something to consider 
for the Power BI team to include as a functionality in order to fulle present hierarchycal drill paths. 
*/

/* CSS Code:
.Box {
    font - family: Calibri;
}
.Box Active {
    font - family: Calibri;
}
.BarLabel{
    font - family: Calibri;
    font - size:12px;
}
.PercBar {
    font - family: Calibri;
}
.PercBarBar {
    font - family: Calibri;
}     
 .ConnectorActive {
    font - family: Calibri;
}
 .Connector {
    fill: #EEEEEE;
}
*/

/// <reference path="../_references.ts"/>

module powerbi.visuals {
    var colYellow = "#fec349";
    var colYellowLight = "#fcd68a";
    var colBlue = "#005D9D";
    var colBlueLight = "#5E839B";
    var colGray = "#e8e8e8";
    var colGrayLight = "#f1f1f1";

    var barItemClicked = false;
    var drillUpClicked = false;
    var DrillModeEnabled = false;

    var itemHeight = 35;
    var itemHeightDistance = 45;
    var itemWidthDistance;
    var itemWidthDistanceMin = 150;
    var itemWidthDistanceMax = 200;
    var itemWidth = 120;

    export interface BreakdownTreePercent {
        value: number;
        percent: number;
        isTop: boolean;
    }

    export interface BreakdownTreeSlice extends SelectableDataPoint, TooltipEnabledDataPoint, LabelEnabledDataPoint {
        value: number;
        label: string;
        key: string;
        categoryOrMeasureIndex: number;
        highlight?: boolean;
        highlightValue?: number;
        color: string;
        x: number;
        y: number;
        cssPrefix: string;
        measureCalc: number;
        sumOfMeasureCalc: number;
        percentOfTotal: number;
        maxPercentOfTotal: number;
        yAdj: number;
        isSelectedForDrill: boolean;
        currentLevelIndex: number;
        totalLevels: number;
        formattedValue: string;
        dimensionAttributeQueryName: string;
        dimensionAttributeFriendlyName: string;
    }

    export interface BreakdownTreeData {
        slices: BreakdownTreeSlice[];
        categoryLabels: string[];
        valuesMetadata: DataViewMetadataColumn[];
        hasHighlights: boolean;
        highlightsOverflow: boolean;
        dataLabelsSettings: VisualDataLabelsSettings;
        canShowDataLabels: boolean;
    }

    export interface BreakdownTreeAxisOptions {
        maxScore: number;
        xScale: D3.Scale.OrdinalScale;
        yScale: D3.Scale.LinearScale;
        verticalRange: number;
        margin: IMargin;
        rangeStart: number;
        rangeEnd: number;
        barToSpaceRatio: number;
        categoryLabels: string[];
    }

    export interface IBreakdownTreeLayout {
        LayoutBox: {
            x: (d: BreakdownTreeSlice) => number;
            y: (d: BreakdownTreeSlice) => number;
            width: (d: BreakdownTreeSlice) => number;
            height: (d: BreakdownTreeSlice) => number;
        };
    }

    export interface IBreakdownTreeChartSelectors {
        percentBar: {
            root: ClassAndSelector;
            mainLine: ClassAndSelector;
            leftTick: ClassAndSelector;
            rightTick: ClassAndSelector;
            text: ClassAndSelector;
        };
    }

    export interface BreakdownTreeSmallViewPortProperties {
        hideFunnelCategoryLabelsOnSmallViewPort: boolean;
        minHeightFunnelCategoryLabelsVisible: number;
    }

    export interface BreakdownTreeLevel {
        data: BreakdownTreeData;
        mainSelection: D3.Selection;
        clickSelection: D3.Selection;
        otherSelection: D3.Selection;
        connectorSelection: D3.Selection;
        clipPathSelection: D3.Selection;
        polyGray: D3.Selection;
        polyYellow: D3.Selection;
    }

    export class BreakdownTree implements IVisual, IInteractiveVisual {
        public static capabilities: VisualCapabilities = {
            dataRoles: [
                {
                    name: 'Category',
                    kind: VisualDataRoleKind.Grouping,
                    displayName: data.createDisplayNameGetter('Role_DisplayName_Group'),
                }, {
                    name: 'Y',
                    kind: VisualDataRoleKind.Measure,
                    displayName: data.createDisplayNameGetter('Role_DisplayName_Values'),
                }
            ],
            dataViewMappings: [{
                categorical: {
                    categories: {
                        for: { in: 'Category' },
                        dataReductionAlgorithm: { top: {} }
                    },
                    values: {
                        select: [{ bind: { to: 'Y' } }]
                    },
                }
            }],
            objects: {
                general: {
                    displayName: data.createDisplayNameGetter('Visual_General'),
                    properties: {
                        formatString: {
                            type: { formatting: { formatString: true } },
                        },
                    },
                },
                dataPoint: {
                    displayName: data.createDisplayNameGetter('Visual_DataPoint'),
                    properties: {
                        defaultColor: {
                            displayName: data.createDisplayNameGetter('Visual_DefaultColor'),
                            type: { fill: { solid: { color: true } } }
                        },
                        fill: {
                            displayName: data.createDisplayNameGetter('Visual_Fill'),
                            type: { fill: { solid: { color: true } } }
                        },
                        fillRule: {
                            displayName: data.createDisplayNameGetter('Visual_Gradient'),
                            type: { fillRule: {} },
                            rule: {
                                inputRole: 'Gradient',
                                output: {
                                    property: 'fill',
                                    selector: ['Category'],
                                },
                            },
                        }
                    }
                },
                labels: {
                    displayName: data.createDisplayNameGetter('Visual_DataPointsLabels'),
                    properties: {
                        show: {
                            displayName: data.createDisplayNameGetter('Visual_Show'),
                            type: { bool: true }
                        },
                        color: {
                            displayName: data.createDisplayNameGetter('Visual_LabelsFill'),
                            type: { fill: { solid: { color: true } } }
                        },

                        labelPosition: {
                            displayName: data.createDisplayNameGetter('Visual_Position'),
                            type: { formatting: { labelPosition: true } }
                        },
                        labelDisplayUnits: {
                            displayName: data.createDisplayNameGetter('Visual_DisplayUnits'),
                            type: { formatting: { labelDisplayUnits: true } }
                        },
                        labelPrecision: {
                            displayName: data.createDisplayNameGetter('Visual_Precision'),
                            type: { numeric: true }
                        },
                    }
                },
            },
            supportsHighlight: false,
            sorting: {
                default: {},
            },
            drilldown: {
                roles: ['Category']
            },
        };

        public static DefaultBarOpacity = 1;
        public static DimmedBarOpacity = 0.4;
        public static PercentBarToBarRatio = 2;
        public static TickPadding = 0;
        public static InnerTickSize = 0;
        public static InnerTextClassName = 'labelSeries';
        public static CreateSelector = function (className) {
            return {
                class: className,
                selector: '.' + className,
            };
        };
        public static Selectors: IBreakdownTreeChartSelectors = {
            percentBar: {
                root: BreakdownTree.CreateSelector('percentBars'),
                mainLine: BreakdownTree.CreateSelector('mainLine'),
                leftTick: BreakdownTree.CreateSelector('leftTick'),
                rightTick: BreakdownTree.CreateSelector('rightTick'),
                text: BreakdownTree.CreateSelector('value'),
            },
        };
        private static VisualClassName = 'funnelChart';// 'funnelChart';

        private svgContainer: HTMLDivElement;
        private svg: D3.Selection;
        private funnelGraphicsContext: D3.Selection;
        private percentGraphicsContext: D3.Selection;
        private clearCatcher: D3.Selection;
        private axisGraphicsContext: D3.Selection;
        private otherGraphicsContext: D3.Selection;
        private currentViewport: IViewport;
        private colors: IDataColorPalette;
        private data: FunnelData;
        private hostServices: IVisualHostServices;
        private margin: IMargin;
        private options: VisualInitOptions;
        private interactivityService: IInteractivityService;
        private defaultDataPointColor: string;
        private labelPositionObjects: string[] = [labelPosition.outsideEnd, labelPosition.insideCenter];
        // TODO: Remove onDataChanged & onResizing once all visuals have implemented update.
        private dataViews: DataView[];

        private svgLevels: BreakdownTreeLevel[];

        public static getFormattedValue(dataView: DataView, theValue: number, thisRef: BreakdownTree): string {
            thisRef.getMetaDataColumn(dataView);
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

        public metaDataColumn: DataViewMetadataColumn;
        private cardFormatSetting: CardFormatSetting;
        public getMetaDataColumn(dataView: DataView) {
            if (dataView && dataView.metadata && dataView.metadata.columns) {
                for (var i = 0, ilen = dataView.metadata.columns.length; i < ilen; i++) {
                    var column = dataView.metadata.columns[i];
                    if (column.isMeasure) {
                        this.metaDataColumn = column;
                        break;
                    }
                }
            }
        }
        public getDefaultFormatSettings(): CardFormatSetting {
            return {
                showTitle: true,
                labelSettings: dataLabelUtils.getDefaultLabelSettings(true, Card.DefaultStyle.value.color, 0),
            };
        }
        public getFormatString(column: DataViewMetadataColumn): string {
            debug.assertAnyValue(column, 'column');
            return valueFormatter.getFormatString(column, AnimatedText.formatStringProp);
        }

        public static converter(dataView: DataView, colors: IDataColorPalette, thisRef: BreakdownTree, defaultDataPointColor?: string): BreakdownTreeData {
            var slices: BreakdownTreeSlice[] = [];
            var formatStringProp = funnelChartProps.general.formatString;
            var valueMetaData = dataView.metadata ? dataView.metadata.columns.filter(d => d.isMeasure) : [];
            var categories = dataView.categorical.categories || [];

            var values = dataView.categorical.values;

            var hasHighlights = values && values[0] && !!values[0].highlights;
            var highlightsOverflow = false;
            //var categorical: DataViewCategorical = dataView.categorical;
            var dataLabelsSettings: VisualDataLabelsSettings = dataLabelUtils.getDefaultFunnelLabelSettings();

            if (dataView && dataView.metadata && dataView.metadata.objects) {
                var labelsObj = <DataLabelObject>dataView.metadata.objects['labels'];

                if (labelsObj) {
                    dataLabelsSettings.show = (labelsObj.show !== undefined) ? labelsObj.show : dataLabelsSettings.show;
                    dataLabelsSettings.position = (labelsObj.labelPosition !== undefined) ? labelsObj.labelPosition : dataLabelsSettings.position;
                    if (labelsObj.color !== undefined) {
                        dataLabelsSettings.labelColor = labelsObj.color.solid.color;
                    }
                    if (labelsObj.labelDisplayUnits !== undefined) {
                        dataLabelsSettings.displayUnits = labelsObj.labelDisplayUnits;
                    }
                    if (labelsObj.labelPrecision !== undefined) {
                        dataLabelsSettings.precision = (labelsObj.labelPrecision >= 0) ? labelsObj.labelPrecision : 0;
                    }
                }
            }
            if (categories.length === 1 && values) {
                // Single measure
                var category = categories[0];
                var categoryValues = category.values;

                var categorySourceFormatString = valueFormatter.getFormatString(category.source, formatStringProp);

                for (var i = 0, ilen = categoryValues.length; i < ilen; i++) {
                    var measureName = values[0].source.queryName;

                    var identity = SelectionIdBuilder3.builder() // let
                        .withCategory(category, i)
                        .withMeasure(measureName)
                        .createSelectionId();

                    var value = d3.sum(values.map(d => d.values[i]));
                    var formattedCategoryValue = valueFormatter.format(categoryValues[i], categorySourceFormatString);

                    var tooltipInfo: TooltipDataItem[] = TooltipBuilder.createTooltipInfo(formatStringProp, dataView.categorical, formattedCategoryValue, value, null, null, 0, i);

                    var formVal = BreakdownTree.getFormattedValue(dataView, value, thisRef);

                    slices.push({
                        label: formattedCategoryValue,
                        value: value,
                        categoryOrMeasureIndex: i,
                        identity: identity,
                        selected: false,
                        key: identity.getKey(),
                        tooltipInfo: tooltipInfo,
                        color: "#abcdef",
                        labelFill: dataLabelsSettings.labelColor,
                        x: 50,
                        y: 50 * i,
                        width: itemWidth,
                        height: itemHeight,
                        cssPrefix: "_Last",
                        measureCalc: 0,
                        sumOfMeasureCalc: 0,
                        percentOfTotal: 0.5,
                        maxPercentOfTotal: 1,
                        yAdj: 0,
                        isSelectedForDrill: false,
                        currentLevelIndex: 0,
                        totalLevels: 0,
                        formattedValue: formVal,
                        dimensionAttributeQueryName: category.source.queryName,
                        dimensionAttributeFriendlyName: category.source.displayName
                    });
                }
            }

            var categoryLabels = [];
            for (var i = 0; i < slices.length; i += hasHighlights ? 2 : 1) {
                var slice = slices[i];
                categoryLabels.push(slice.label);
            }

            var newDataLevel = {
                slices: slices,
                categoryLabels: categoryLabels,
                valuesMetadata: valueMetaData,
                hasHighlights: hasHighlights,
                highlightsOverflow: highlightsOverflow,
                canShowDataLabels: true,
                dataLabelsSettings: dataLabelsSettings,
            };
            
            // Sort the data
            var dataSorted = newDataLevel.slices.sort(function compare(a, b) { return b.value - a.value; });
            newDataLevel.slices = dataSorted;

            return newDataLevel;
        }

        public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstance[] {
            switch (options.objectName) {
                case 'dataPoint':
                    var dataViewCat: DataViewCategorical = this.dataViews && this.dataViews.length > 0 && this.dataViews[0] && this.dataViews[0].categorical;
                    var hasGradientRole = GradientUtils.hasGradientRole(dataViewCat);
                    if (!hasGradientRole) {
                        return this.enumerateDataPoints();
                    }
                    break;
                case 'labels':
                    return dataLabelUtils.enumerateDataLabels(this.data.dataLabelsSettings, true, true, true, this.labelPositionObjects);
            }
        }

        private enumerateDataPoints(): VisualObjectInstance[] {
            var data = this.data;
            if (!data)
                return;

            var instances: VisualObjectInstance[] = [];
            var slices = data.slices;

            instances.push({
                objectName: 'dataPoint',
                selector: null,
                properties: {
                    defaultColor: { solid: { color: this.defaultDataPointColor || this.colors.getColorByIndex(0).value } }
                },
            });

            for (var i = 0; i < slices.length; i++) {
                var slice = slices[i];
                if (slice.highlight)
                    continue;

                var color = slice.color;
                var selector = slice.identity.getSelector();
                var isSingleSeries = !!selector.data;

                var dataPointInstance: VisualObjectInstance = {
                    objectName: 'dataPoint',
                    displayName: slice.label,
                    selector: ColorHelper.normalizeSelector(selector, isSingleSeries),
                    properties: {
                        fill: { solid: { color: color } }
                    },
                };

                instances.push(dataPointInstance);
            }
            return instances;
        }

        public init(options: VisualInitOptions) {
            this.options = options;
            var element = options.element;

            this.svgContainer = document.createElement("div");
            this.svgContainer.id = "DivContainer";
            element.append(this.svgContainer);

            this.cardFormatSetting = this.getDefaultFormatSettings();

            var svg = this.svg = d3.select("#DivContainer").append("svg")
                .classed(BreakdownTree.VisualClassName, true)
                ;

            this.clearCatcher = appendClearCatcher(this.svg);

            this.svgLevels = [];

            this.currentViewport = options.viewport;
            this.margin = {
                left: 5,
                right: 5,
                top: 0,
                bottom: 0
            };
            var style = options.style;
            this.colors = style.colorPalette.dataColors;
            this.hostServices = options.host;
            this.interactivityService = VisualInteractivityFactory.buildInteractivityService(options);
            this.percentGraphicsContext = svg.append('g').classed(BreakdownTree.Selectors.percentBar.root.class, true);
            this.funnelGraphicsContext = svg.append('g');
            this.otherGraphicsContext = svg.append('g');
            this.axisGraphicsContext = svg.append('g');

            this.updateViewportProperties();
        }

        private GetNeededSizePixels(): { w: number; h: number; } {
            var maxNoLevel = 0;
            for (var l = 0; l < this.svgLevels.length; l++) {
                if (this.svgLevels[l].data.slices.length > maxNoLevel)
                    maxNoLevel = this.svgLevels[l].data.slices.length;
            }
            var h = maxNoLevel * itemHeightDistance - (itemHeightDistance - itemHeight);
            var w = this.svgLevels.length * itemWidthDistance;

            return { w: w, h: h };
        }

        private updateViewportProperties() {
            var viewport = this.currentViewport;
            var sH = viewport.height;
            var sW = viewport.width;

            var neededSize = this.GetNeededSizePixels();
            this.svg
                .attr('width', d3.max([neededSize.w, sW]))
                .attr('height', d3.max([neededSize.h, sH]))
            ;

            this.svgContainer.style.width = sW + "px";
            this.svgContainer.style.height = sH + "px";

            if (neededSize.w > sW || neededSize.h > sH)
                this.svgContainer.style.overflow = "auto";
            else
                this.svgContainer.style.overflow = "hidden";
        }

        private AddDataLevel(newData: BreakdownTreeData): void {
            var newLevelIndex = this.svgLevels.length;
            var newLevel: BreakdownTreeLevel = {
                data: newData,
                mainSelection: null,
                clickSelection: null,
                otherSelection: null,
                connectorSelection: null,
                clipPathSelection: null,
                polyGray: null,
                polyYellow: null
            };
            this.addSvgContainersToLevel(newLevel);

            var lastLevelData = this.svgLevels[newLevelIndex - 1];
            // Do not add same data
            var isSameData = true;
            if (newLevelIndex > 0) {
                if (lastLevelData.data.slices.length !== newData.slices.length) {
                    isSameData = false;
                }
                else {
                    for (var i = 0; i < newData.slices.length; i++) {
                        if (newData.slices[i].identity !== lastLevelData.data.slices[i].identity || newData.slices[i].value !== lastLevelData.data.slices[i].value) { // Data is sorted so this comparison is ok
                            isSameData = false;
                            break;
                        }
                    }
                }
                if (isSameData) {
                    //alert("same!");
                    return;
                }
            }
            
            // TODO: New data, but not drillup or drilldown => crossfilter 
                      
            this.svgLevels.push(newLevel);

            for (var i = 0; i < newData.slices.length; i++) {
                var ci = newData.slices[i];
                ci.currentLevelIndex = newLevelIndex;
            }

            for (var l = 0; l < this.svgLevels.length; l++) {
                for (var i = 0; i < this.svgLevels[l].data.slices.length; i++) {
                    var ci = this.svgLevels[l].data.slices[i];
                    ci.x = l * itemWidthDistance;
                }
            }
        }

        private addSvgContainersToLevel(svgLevel) {
            svgLevel.mainSelection = this.svg.append("g");
            svgLevel.otherSelection = this.svg.append("g");
            svgLevel.clickSelection = this.svg.append("g");
            svgLevel.connectorSelection = this.svg.append("g");
            svgLevel.polyGray = svgLevel.connectorSelection.append("polygon");
            svgLevel.polyYellow = svgLevel.connectorSelection.append("polygon");
            svgLevel.clipPathSelection = this.svg.append("g");
            svgLevel.clipPathSelection.append("clipPath");
        }

        private resetLastLevelSVG() {
            var toRemoveLevel = this.svgLevels[this.svgLevels.length - 1];
            toRemoveLevel.mainSelection.remove();
            toRemoveLevel.otherSelection.remove();
            toRemoveLevel.clickSelection.remove();
            toRemoveLevel.connectorSelection.remove();
            toRemoveLevel.polyGray.remove();
            toRemoveLevel.polyYellow.remove();
            toRemoveLevel.clipPathSelection.remove();
            this.addSvgContainersToLevel(toRemoveLevel);
        }

        private removeLastLevelSVG() {
            if (this.svgLevels.length > 0) {
                var toRemoveLevel = this.svgLevels[this.svgLevels.length - 1];
                toRemoveLevel.mainSelection.remove();
                toRemoveLevel.otherSelection.remove();
                toRemoveLevel.connectorSelection.remove();
                toRemoveLevel.clickSelection.remove();
                toRemoveLevel.polyGray.remove();
                toRemoveLevel.polyYellow.remove();
                toRemoveLevel.clipPathSelection.remove();
                this.svgLevels.splice(this.svgLevels.length - 1, 1);
            }
        }

        public update(options: VisualUpdateOptions): void {
            debug.assertValue(options, 'options');
            this.data = {
                slices: [],
                categoryLabels: [],
                valuesMetadata: [],
                hasHighlights: false,
                highlightsOverflow: false,
                canShowDataLabels: true,
                dataLabelsSettings: dataLabelUtils.getDefaultFunnelLabelSettings(),
            };

            var dataViews = this.dataViews = options.dataViews;
            this.currentViewport = options.viewport;

            if (dataViews && dataViews.length > 0) {
                if (barItemClicked && !drillUpClicked) {
                    // Drill down!
                    this.resetLastLevelSVG();
                }
                else if (drillUpClicked) {
                    // Drill up!
                    // Remove last two levels
                    this.removeLastLevelSVG();
                    this.removeLastLevelSVG();
                }
                else {
                    // New data, no drill up or drill down
                    // We have new data - reset last level
                    //while (this.svgLevels.length > 0) {
                    //    this.removeLastLevelSVG();
                    //}
                    this.removeLastLevelSVG();
                }
                barItemClicked = false;
                drillUpClicked = false;

                var dataView = dataViews[0];

                if (dataView.metadata && dataView.metadata.objects) {
                    var defaultColor = DataViewObjects.getFillColor(dataView.metadata.objects, funnelChartProps.dataPoint.defaultColor);
                    if (defaultColor)
                        this.defaultDataPointColor = defaultColor;
                }

                if (dataView.categorical) {
                    var newData = BreakdownTree.converter(dataView, this.colors, this, this.defaultDataPointColor);
                    // TODO: Check if we have a new level or not.
                    this.AddDataLevel(newData);
                    this.data = newData;

                    if (this.interactivityService) {
                        this.interactivityService.applySelectionStateToData(newData.slices);
                    }
                }

                var warnings = getInvalidValueWarnings(
                    dataViews,
                    false /*supportsNaN*/,
                    false /*supportsNegativeInfinity*/,
                    false /*supportsPositiveInfinity*/);

                if (warnings && warnings.length > 0)
                    this.hostServices.setWarnings(warnings);
            }

            this.updateViewportProperties();
            this.updateInternal(options.suppressAnimations);
        }

        // TODO: Remove onDataChanged & onResizing once all visuals have implemented update.
        public onDataChanged(options: VisualDataChangedOptions): void {
            this.update({
                dataViews: options.dataViews,
                suppressAnimations: options.suppressAnimations,
                viewport: this.currentViewport
            });
        }

        // TODO: Remove onDataChanged & onResizing once all visuals have implemented update.
        public onResizing(viewport: IViewport): void {
            this.currentViewport = viewport;
            this.update({
                dataViews: this.dataViews,
                suppressAnimations: true,
                viewport: this.currentViewport
            });
        }

        private prepareAllLevelData(cv: IViewport) {
            var sH = cv.height;
            var curSize = this.GetNeededSizePixels();
            if (sH > curSize.h) {
                curSize.h = sH;
            }
            for (var l = 0; l < this.svgLevels.length; l++) {
                var curLev = this.svgLevels[l];
                var prevLev = null;
                if (l > 0) {
                    prevLev = this.svgLevels[l - 1];
                }

                var yAdj = 0;
                // First Level - try to center it.
                var totalLevelHeight = curLev.data.slices.length * itemHeightDistance;
                if (totalLevelHeight < sH) {
                    yAdj = (sH - totalLevelHeight) / 2;
                }
                // Other levels - try to center to selection in previous level
                if (l > 0) {
                    var prevLevelSelectedIndex = -1;
                    for (var i = 0; i < prevLev.data.slices.length; i++) {
                        if (prevLev.data.slices[i].isSelectedForDrill) {
                            prevLevelSelectedIndex = i;
                            break;
                        }
                    }
                    yAdj = prevLevelSelectedIndex * itemHeightDistance + itemHeight * 0.5 + prevLev.data.slices[0].yAdj;
                    yAdj -= (curLev.data.slices.length * itemHeightDistance - (itemHeightDistance - itemHeight)) / 2;
                    var lastPixelYPos = curLev.data.slices.length * itemHeightDistance + yAdj;
                    //if (lastPixelYPos > sH) {
                    //    yAdj -= (lastPixelYPos - sH);
                    //}
                    if (lastPixelYPos > curSize.h) {
                        yAdj -= (lastPixelYPos - curSize.h);
                    }
                    if (yAdj < 0) {
                        yAdj = 0;
                    }
                }

                var minValue = d3.min(curLev.data.slices, function (d) { return d.value; });
                if (minValue > 0) {
                    minValue = 0;
                }
                //var sumMeasureCalc = d3.sum(curLev.data.slices, function(d) {return d.value-minValue;});
                var sumMeasureCalc = curLev.data.slices[0].value - minValue;
                for (var i = 0; i < curLev.data.slices.length; i++) {
                    var curVal = curLev.data.slices[i];
                    curVal.x = l * itemWidthDistance;
                    curVal.y = i * itemHeightDistance + yAdj;
                    curVal.measureCalc = curVal.value - minValue;
                    curVal.percentOfTotal = curVal.measureCalc / sumMeasureCalc;
                    curVal.yAdj = yAdj;
                    curVal.totalLevels = this.svgLevels.length;
                }
                if (curLev.data.slices.length === 1) {
                    curLev.data.slices[0].percentOfTotal = 1;
                }

                var maxPercentOfTotal = d3.max(curLev.data.slices, function (d) { return d.percentOfTotal; });
                for (var i = 0; i < curLev.data.slices.length; i++) {
                    var curVal = curLev.data.slices[i];
                    curVal.percentOfTotal = curVal.percentOfTotal / maxPercentOfTotal;
                }

            }
        }

        private updateInternal(suppressAnimations: boolean) {
            if (this.data == null)
                return;

            var duration = suppressAnimations ? 0 : AnimatorCommon.MinervaAnimationDuration;

            var data = this.data;
            var slices = data.slices;

            var shapes: D3.UpdateSelection;
            var dataLabels: D3.UpdateSelection;

            itemWidthDistance = this.currentViewport.width * 0.70 / this.svgLevels.length;
            if (itemWidthDistance < itemWidthDistanceMin)
                itemWidthDistance = itemWidthDistanceMin;
            if (itemWidthDistance > itemWidthDistanceMax)
                itemWidthDistance = itemWidthDistanceMax;

            this.prepareAllLevelData(this.currentViewport);

            var oPrevLevel = null;
            for (var l = 0; l < this.svgLevels.length - 1; l++) {
                var oLevel = this.svgLevels[l];
                l === 0 ? oPrevLevel = null : oPrevLevel = this.svgLevels[l - 1];
                BreakdownTree.drawDefaultShapes(oLevel.data, oLevel.data.slices, oLevel.mainSelection, duration);
                BreakdownTree.drawOtherShapes(oLevel, oPrevLevel, oLevel.data.slices, oLevel.otherSelection, duration);
            }

            var oLevel = this.svgLevels[this.svgLevels.length - 1];
            this.svgLevels.length <= 1 ? oPrevLevel = null : oPrevLevel = this.svgLevels[this.svgLevels.length - 2];
            //var layout = BreakdownTree.getLayout(oLevel.data, this.currentViewport);
            shapes = BreakdownTree.drawDefaultShapes(oLevel.data, oLevel.data.slices, oLevel.mainSelection, duration);
            BreakdownTree.drawOtherShapes(oLevel, oPrevLevel, oLevel.data.slices, oLevel.otherSelection, duration);
            var shapesClick = BreakdownTree.drawClickShapes(oLevel.data, oLevel.data.slices, oLevel.clickSelection, duration);

            if (this.interactivityService) {
                var behaviorOptions: BreakdownTreeBehaviorOptions = {
                    datapoints: slices,
                    bars: shapesClick,
                    labels: dataLabels,
                    clearCatcher: this.clearCatcher,
                    hasHighlights: data.hasHighlights,
                };

                // Här sker all drilldown etc
                this.interactivityService.apply(this, behaviorOptions);   
                
                // Hook up to drillup event
                var btnDrillUp = $("#" + this.svgContainer.id).closest("div.visualContainer").find("button[ng-click='drillUp()']");
                btnDrillUp.click(function () { drillUpClicked = true; });

                // Hook up to toggle drill down event
                var btnToggleDrillDown = $("#" + this.svgContainer.id).closest("div.visualContainer").find("button[ng-click='toggleDrillMode()']");
                btnToggleDrillDown.click(function (a) { DrillModeEnabled = ($(a.target).attr("class").indexOf("drillModeEnabled") > -1); });

                // Custom click
                shapesClick.each(function (d, i) {
                    var currentClickFunc = d3.select(this).on("click");
                    d3.select(this).on("click", function (a, b) {
                        if (DrillModeEnabled) {
                            a.isSelectedForDrill = true;
                            barItemClicked = true;
                            currentClickFunc(a, b); // If we want crossfiltering to work move this outside the if
                        }
                    });
                });
            }

            TooltipManager.addTooltip(shapesClick, (tooltipEvent: TooltipEvent) => tooltipEvent.data.tooltipInfo);

            SVGUtil.flushAllD3TransitionsIfNeeded(this.options);
        }

        public accept(visitor: InteractivityVisitor, options: any): void {
            visitor.visitFunnel(options);
        }

        public onClearSelection(): void {
            if (this.interactivityService)
                this.interactivityService.clearSelection();
        }

        public static drawDefaultAxis(graphicsContext: D3.Selection, axisOptions: BreakdownTreeAxisOptions, isHidingPercentBars: boolean): void {
            var xScaleForAxis = d3.scale.ordinal()
                .domain(axisOptions.categoryLabels)
                .rangeBands([axisOptions.rangeStart, axisOptions.rangeEnd], axisOptions.barToSpaceRatio, isHidingPercentBars ? axisOptions.barToSpaceRatio : BreakdownTree.PercentBarToBarRatio);
            var xAxis = d3.svg.axis()
                .scale(xScaleForAxis)
                .orient("right")
                .tickPadding(BreakdownTree.TickPadding)
                .innerTickSize(BreakdownTree.InnerTickSize);
            graphicsContext.classed('axis', true)
                .attr('transform', SVGUtil.translate(0, axisOptions.margin.top))
                .call(xAxis);
        }

        public static drawOtherShapes(levelCur: any, levelPrev: any, slices: BreakdownTreeSlice[], graphicsContext: D3.Selection, transitionDuration: number) {
            var data = levelCur.data;
            var dataPrev = null;
            if (levelPrev != null)
                dataPrev = levelPrev.data;

            var isLastLevel = (slices[0].totalLevels - 1) === slices[0].currentLevelIndex;
            var colorSelected = isLastLevel ? colYellow : colYellowLight;
            var colorBlue = isLastLevel ? colBlue : colBlueLight; 
            
            // Gray background % bar
            var s = graphicsContext.selectAll('.PercBar').data(slices);
            s.enter().append("rect")
            ;
            s
            //.transition().duration(transitionDuration)
                .attr("x", function (d) { return d.x + itemWidth * 0.05; })
                .attr("y", function (d) { return d.y + itemHeight * 0.1; })
                .attr("width", function (d) { return d.width - itemWidth * 0.05 * 2; })
                .attr("height", function (d) { return 10; })
                .attr("fill", "#cccccc")
                .attr("class", "PercBar")
            ;
            s.exit().remove();

            // Blue % bar
            s = graphicsContext.selectAll('.PercBarBar').data(slices);
            s.enter().append("rect")
                .attr("fill", "#dddddd")
                .attr({ width: 0 });
            s
            //.transition().duration(transitionDuration)
                .attr("x", function (d) { return d.x + itemWidth * 0.05; })
                .attr("y", function (d) { return d.y + itemHeight * 0.1; })
                .attr("width", function (d) { var w = d.percentOfTotal * (d.width - (itemWidth * 0.05 * 2)); return w; })
                .attr("height", function (d) { return 10; })
                .attr("fill", colorBlue)
                .attr("class", "PercBarBar")
            ;
            s.exit().remove();
            
            // Text
            s = graphicsContext.selectAll('.BarLabel').data(slices);
            s.enter().append("text")
            ;
            s
            //.transition().duration(transitionDuration)
                .attr("x", function (d) { return d.x + itemWidth * 0.05; })
                .attr("y", function (d) { return d.y + itemHeightDistance * 0.7; })
                .attr("class", "BarLabel")
                .attr("clip-path", function (d) { return "url(#textclip" + d.currentLevelIndex + ")"; })
                .text(function (d) { return d.formattedValue + " " + d.label; })
                .attr("clip-path", "url(#textclip" + slices[0].currentLevelIndex + ")")
            ;
            s.exit().remove();
            
            // Clip Path
            levelCur.clipPathSelection.select("clipPath").attr("id", "textclip" + slices[0].currentLevelIndex).append("rect");
            levelCur.clipPathSelection.select("clipPath").select("rect")
                .attr("x", itemWidthDistance * slices[0].currentLevelIndex + itemWidth * 0.05)
                .attr("y", slices[0].yAdj)
                .attr("width", itemWidth * 0.9)
                .attr("height", itemHeightDistance * slices.length)
            ;
            
            // Connections
            if (dataPrev != null) {
                var prevIndexSelected = -1;
                var curIndexSelected = -1;
                for (var i = 0; i < dataPrev.slices.length; i++) {
                    if (dataPrev.slices[i].isSelectedForDrill) {
                        prevIndexSelected = i;
                        break;
                    }
                }
                for (var i = 0; i < data.slices.length; i++) {
                    if (data.slices[i].isSelectedForDrill) {
                        curIndexSelected = i;
                        break;
                    }
                } 
                // Gray arrow
                var startY = prevIndexSelected * itemHeightDistance + itemHeight * 0.5 + dataPrev.slices[0].yAdj;
                var startX = itemWidthDistance * (data.slices[0].currentLevelIndex - 1) + itemWidth + (itemWidthDistanceMin - itemWidth) * 0.1;
                var endY1 = data.slices[0].yAdj;
                var endY2 = data.slices.length * itemHeightDistance - (itemHeightDistance - itemHeight) + data.slices[0].yAdj;
                var endX = itemWidthDistance * data.slices[0].currentLevelIndex - (itemWidthDistanceMin - itemWidth) * 0.1;
                levelCur.polyGray
                    .attr("class", "Connector")
                    .attr("points", startX + "," + startY + ",   " + endX + "," + endY1 + ",  " + endX + "," + endY2)
                ;                
                
                // Yellow arrow
                if (curIndexSelected >= 0) {
                    // Small
                    var endY = curIndexSelected * itemHeightDistance + itemHeight * 0.5 + data.slices[0].yAdj;
                    levelCur.polyYellow
                        .attr("class", "ConnectorActive")
                        .attr("points", startX + "," + startY + ",   " + endX + "," + (endY - itemHeight * 0.5) + ",  " + endX + "," + (endY + itemHeight * 0.5))
                        .attr("fill", colorSelected)
                    ;
                }
                else {
                    // Big
                    levelCur.polyYellow
                        .attr("class", "ConnectorActive")
                        .attr("points", startX + "," + startY + ",   " + endX + "," + endY1 + ",  " + endX + "," + endY2)
                        .attr("fill", colorSelected)
                    ;
                }

            }
        }

        public static drawDefaultShapes(data: BreakdownTreeData, slices: BreakdownTreeSlice[], graphicsContext: D3.Selection, transitionDuration: number): D3.UpdateSelection {
            var s = graphicsContext.selectAll(".Box").data(slices);

            var isLastLevel = (slices[0].totalLevels - 2) === slices[0].currentLevelIndex;
            var colorSelected = isLastLevel ? colYellow : colYellowLight;
            var colorNotSelected = isLastLevel ? colGray : colGrayLight; 

            // Add
            s.enter().append("rect")
                .classed("Box", true);

            // Update
            s.transition().duration(transitionDuration);
            s.attr("x", function (d) { return d.x; })
                .attr("y", function (d) { return d.y; })
                .attr("width", function (d) { return d.width; })
                .attr("height", function (d) { return d.height; })
                .attr("fill", function (d) { if (d.isSelectedForDrill) { return colorSelected; } else { return colorNotSelected; } })
            ;
            
            // Remove
            s.exit().remove();

            return s;
        }

        public static drawClickShapes(data: BreakdownTreeData, slices: BreakdownTreeSlice[], graphicsContext: D3.Selection, transitionDuration: number): D3.UpdateSelection {
            var s = graphicsContext.selectAll(".BoxClick").data(slices);

            // Add
            s.enter().append("rect")
                .classed("BoxClick", true);

            // Update
            s.transition().duration(transitionDuration);
            s.attr("x", function (d) { return d.x; })
                .attr("y", function (d) { return d.y; })
                .attr("width", function (d) { return d.width; })
                .attr("height", function (d) { return d.height; })
                .attr("opacity", "0")
                .attr("fill", "#ffffff")
            ;
            
            // Remove
            s.exit().remove();

            return s;
        }

        public static getFunnelSliceValue(slice: BreakdownTreeSlice) {
            return slice.highlight ? slice.highlightValue : slice.value;
        }

    }

    /* Behaviours */
    export interface BreakdownTreeBehaviorOptions {
        datapoints: SelectableDataPoint[];
        bars: D3.Selection;
        labels: D3.Selection;
        clearCatcher: D3.Selection;
        hasHighlights: boolean;
    }

    export class BreakdownTreeWebBehavior {
        public select(hasSelection: boolean, selection: D3.Selection, hasHighlights: boolean) {
            selection.style("fill-opacity", (d: FunnelSlice) => ColumnUtil.getFillOpacity(d.selected, d.highlight, !d.highlight && hasSelection, !d.selected && hasHighlights));
        }
    }

    /* Capabilities */
    export var BreakdownTreeChartProps = {
        general: {
            formatString: <DataViewObjectPropertyIdentifier>{ objectName: 'general', propertyName: 'formatString' },
        },
        dataPoint: {
            defaultColor: <DataViewObjectPropertyIdentifier>{ objectName: 'dataPoint', propertyName: 'defaultColor' },
            fill: <DataViewObjectPropertyIdentifier>{ objectName: 'dataPoint', propertyName: 'fill' },
        },
    };

    export class SelectionIdBuilder3 {
        private dataMap: SelectorForColumn;
        private measure: string;

        public static builder(): SelectionIdBuilder3 {
            return new SelectionIdBuilder3();
        }

        public withCategory(categoryColumn: DataViewCategoryColumn, index: number): SelectionIdBuilder3 {
            if (categoryColumn && categoryColumn.source && categoryColumn.source.queryName && categoryColumn.identity)
                this.ensureDataMap()[categoryColumn.source.queryName] = categoryColumn.identity[index];

            return this;
        }

        public withSeries(seriesColumn: DataViewValueColumns, valueColumn: DataViewValueColumn | DataViewValueColumnGroup): SelectionIdBuilder3 {
            if (seriesColumn && seriesColumn.source && seriesColumn.source.queryName && valueColumn)
                this.ensureDataMap()[seriesColumn.source.queryName] = valueColumn.identity;

            return this;
        }

        public withMeasure(measureId: string): SelectionIdBuilder3 {
            this.measure = measureId;

            return this;
        }

        public createSelectionId(): SelectionId {
            return SelectionId.createWithSelectorForColumnAndMeasure(this.ensureDataMap(), this.measure);
        }

        private ensureDataMap(): SelectorForColumn {
            if (!this.dataMap)
                this.dataMap = {};

            return this.dataMap;
        }
    }
}

module powerbi.visuals.plugins {
    export var _BreakdownTree: IVisualPlugin = {
        name: '_BreakdownTree',
        class: '_BreakdownTree',
        capabilities: BreakdownTree.capabilities,
        create: () => new BreakdownTree()
    };
}
