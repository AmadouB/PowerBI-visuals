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
Created by Fredrik Hedenström, 2015-09-28
*/

/// <reference path="../_references.ts"/>

module powerbi.visuals {
    export interface SEUDataPoint {
        value: number;
        formattedValue:string;
        phase1: number;
        phase2: number;
        phase3: number;
        phase4: number;
        category: string;
        x: number;
        y: number;
        wantedX: number;
        wantedY: number;
        radius: number;
        isHit: boolean;       
        selector: data.Selector;
    }

    function collide(node) {
        var r = node.radius + 16,
          nx1 = node.x - r,
          nx2 = node.x + r,
          ny1 = node.y - r,
          ny2 = node.y + r;
        return function (quad, x1, y1, x2, y2) {
            if (quad.point && (quad.point !== node)) {
                var x = node.x - quad.point.x,
                  y = node.y - quad.point.y,
                  l = Math.sqrt(x * x + y * y),
                  r = node.radius + quad.point.radius;
                if (l < r) {
                    l = (l - r) / l * .5;
                    node.x -= x *= l;
                    node.y -= y *= l;
                    quad.point.x += x;
                    quad.point.y += y;
                }
            }
            return x1 > nx2 || x2 < nx1 || y1 > ny2 || y2 < ny1;
        };
    }

    export class ShootEmUpChart implements IVisual {
        public static capabilities: VisualCapabilities = {
            dataRoles: [
                {
                    name: 'Values',
                    kind: VisualDataRoleKind.Measure,
                    displayName: data.createDisplayNameGetter('Role_DisplayName_Value'),
                }, {
                    name: 'Category',
                    kind: VisualDataRoleKind.Grouping,
                    displayName: data.createDisplayNameGetter('Role_DisplayName_Axis'),
                }],
            dataViewMappings: [{
                conditions: [
                    { 'Values': { max: 1 } },
                ],
                categorical: {
                    categories: {
                        for: { in: 'Category' },
                        dataReductionAlgorithm: { top: {} }
                    },
                    values: {
                        select: [
                            { bind: { to: 'Values' } }
                        ]
                    }
                },
            }],
           
        };

        private svg: D3.Selection;
        private dataView: DataView;
        private selectionManager: utility.SelectionManager;
        private sH: number;
        private sW: number;
        private scale: number;
    
        private globalTicks: number;
        private speed: number;
        private area = { width: 0, height: 0 };
        private player:any = {};
        private enemies: any = [];
        private points = [];
        private enemyS = null;
        private arrData: SEUDataPoint[];
        private force: D3.Layout.ForceLayout = null;
        private color: D3.Scale.OrdinalScale = null;        

        public static getFormattedValue(dataView: DataView, theValue: number, thisRef: ShootEmUpChart): string {
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

        private metaDataColumn: DataViewMetadataColumn;
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
                wordWrap: false
            };
        }

        public getFormatString(column: DataViewMetadataColumn): string {
            debug.assertAnyValue(column, 'column');
            return valueFormatter.getFormatString(column, AnimatedText.formatStringProp);
        }

        private converter(): SEUDataPoint[] {
            var dataPoints: SEUDataPoint[] = [];
            
            //var catDv: DataViewCategorical = this.dataView.categorical;
            for (var i = 0, len = this.dataView.categorical.values[0].values.length; i < len; i++) {
                var val = this.dataView.categorical.values[0].values[i];
                var cat = this.dataView.categorical.categories[0].values[i];
                dataPoints.push({
                    value: val,
                    formattedValue:ShootEmUpChart.getFormattedValue(this.dataView, val, this),
                    phase1: Math.random() * 3.14,
                    phase2: Math.random() * 3.14,
                    phase3: Math.random() * 3.14,
                    phase4: Math.random() * 3.14,
                    category: cat,
                    x: 0,
                    y: 0,
                    wantedX: 0,
                    wantedY: 0,
                    radius: 0,
                    isHit: false,      
                    selector: null
                });
            }
            return dataPoints;
         }

        public init(options: VisualInitOptions): void {
            this.svg = d3.select(options.element.get(0))
                .append('svg');

            this.checkForCollision(null);
            this.checkForCollisionToEnemyShots(null);
            this.resetToNewLevel(null);

            this.cardFormatSetting = null;

            this.selectionManager = new utility.SelectionManager({ hostServices: options.host });
            
            this.globalTicks = 0;
            this.speed = 0.5;
            this.player = {};
            this.enemies = [];
            this.points = [];
            this.enemyS = null;

            this.arrData = [];
            this.force = null;           
            this.color = d3.scale.category20();
            
            this.force = null;
            this.player = null;

            this.enemies = null;
            
            var thisRef = this;
            setInterval(function () { thisRef.tickEnemies(thisRef); }, 20);
            setInterval(function () { thisRef.tickPlayer(thisRef); }, 20);
        }
        
        private tickEnemies (thisRef:ShootEmUpChart) {
            var q = d3.geom.quadtree(thisRef.arrData, null, null, null, null);
            thisRef.globalTicks += 0.02;

            var arrData = thisRef.arrData;
            var enemies = thisRef.enemies;
            var globalTicks = thisRef.globalTicks;
            var area = thisRef.area;
            var speed = thisRef.speed;
            var scale = thisRef.scale;
            var points = thisRef.points;
            var svg = thisRef.svg;
            var color = thisRef.color;
            var sH = thisRef.sH;
            //var sW = thisRef.sW;
            var player = thisRef.player;

            for (var i = 0; i < arrData.length; i++) {
                var o = arrData[i];
                o.wantedX = area.width * 0.5;
                o.wantedX += 0.2 * area.width * Math.cos(globalTicks + o.phase1);
                o.wantedX += 0.3 * area.width * Math.cos(globalTicks + o.phase2);
                o.wantedY = area.height * 0.5;
                o.wantedY += 0.3 * area.height * Math.sin(globalTicks + o.phase3);
                o.wantedY += 0.1 * area.height * Math.sin(globalTicks + o.phase4 + o.phase1);

                o.phase1 += 0.01 * speed * 0.01;
                o.phase2 += 0.03 * speed * 0.01;
                o.phase3 += 0.07 * speed * 0.01;

                var xDist = o.wantedX - o.x;
                var yDist = o.wantedY - o.y;
                o.x += xDist * 0.1;
                o.y += yDist * 0.1;

                var en = enemies[i];

                o.isHit = en.isHit;

                en.x = o.x;
                en.y = o.y;
                if (Math.random() < (0.003 * speed) && !en.fireOn && !en.isHit) {
                    // Enemy is starting fireing
                    en.fireOn = true;
                    en.fireX = o.x;
                    en.fireY = o.y;
                }
                if (en.fireOn) {
                    en.s
                        .attr("opacity", 1)
                        .attr("cy", en.fireY)
                        .attr("cx", en.fireX)
                    ;
                    en.fireY += 3 * scale;
                    if (en.fireY > sH + 10) {
                        en.fireOn = false;
                    }
                }
            }
            for (var i = 0; i < arrData.length; i++) {
                q.visit(collide(arrData[i]));
            }
            for (var i = 0; i < points.length; i++) {
                var p = points[i];
                p.y += p.velY;
                p.velY -= 0.2;
                if (p.y < -20) {
                    points.splice(i, 1);
                    i++;
                }
            }

            // Draw enemies
            svg.selectAll(".enemies")
            .attr("cx", function (d) { return d.x; })
            .attr("cy", function (d) { return d.y; })
            .attr("fill", function (d, i) {
                var retValue = "black";
                if (d.isHit) {
                    retValue= "black";
                }
                else {
                    retValue = color(i % 20);;
                }
                return retValue;
            });         
            
            var ps = svg.selectAll(".pointstext").data(points);
            ps.enter().append("text")
                .classed("pointstext", true)
            ;
            ps
                .attr("x", function (d) { return d.x; })
                .attr("y", function (d) { return d.y; })
                .attr("color", "#abcdef")
                .attr("text-anchor", "middle")
                .attr("font-size", "15px")
                .attr("font-family", "Calibri")
                .attr("font-weight", "bold")
                .attr("unselectable", "on")
                .text(function (d) { return d.category; });
            ;
            ps.exit().remove();
            // Draw points text 2
            var ps2 = svg.selectAll(".pointstext2").data(points);
            ps2.enter().append("text")
                .classed("pointstext2", true)
            ;
            ps2
                .attr("x", function (d) { return d.x; })
                .attr("y", function (d) { return d.y + 10 * scale; })
                .attr("color", "#abcdef")
                .attr("text-anchor", "middle")
                .attr("font-size", "13px")
                .attr("font-family", "Calibri")
                .text(function (d) { return d.formattedValue; });
            ;
            ps2.exit().remove();

            // Draw score
            player.sScore.text("Score: " + player.score);

            // Draw got all
            player.gotAllTimer++;
            var sz = (24 + player.gotAllTimer / 10) * scale;
            player.sCongrats.attr("font-size", sz + "px")
            ;
            if (player.gotAllTimer > 100 && player.gotAll === true) {
                player.gotAll = false;
                player.gotAllTimer = 0;
                player.sCongrats.attr("opacity", 0);
                thisRef.resetToNewLevel(thisRef);
            } 
        }        
        
        private tickPlayer (thisRef:ShootEmUpChart) {
            var player = thisRef.player;

            // Player
            var wantedX = player.mouse[0];
            if (isNaN(wantedX)) {
                return;
            }
            var xDist = wantedX - player.x;
            player.velx = xDist * 0.1;
            player.x += xDist * 0.1;
            player.s.attr("cx", player.x);
            // Shots
            for (var i = 0; i < player.shots.length; i++) {
                var ss = player.shots[i];
                ss.y -= ss.vely;
                ss.x += ss.velx;
                ss.s.attr("cy", ss.y).attr("cx", ss.x);
                if (ss.y < -10) {
                    // Remove it
                    player.shots.splice(i, 1);
                    i++;
                }
            }
            thisRef.checkForCollision(thisRef);
            thisRef.checkForCollisionToEnemyShots(thisRef);
        }        
        
        private checkForCollisionToEnemyShots(thisRef: ShootEmUpChart) {
            if (thisRef == null)
                return;
                
            var enemies = thisRef.enemies;
            var player = thisRef.player;
            var speed = thisRef.speed;
            var arrData = thisRef.arrData;

            // Check if we are hit by an enemy
            for (var e = 0; e < enemies.length; e++) {
                if (enemies[e].fireOn) {
                    var ee = enemies[e];
                    var x1 = ee.fireX, y1 = ee.fireY, r1 = 5;
                    var x2 = player.x, y2 = player.y, r2 = player.radius;
                    var r12 = (r1 + r2);
                    var dist = Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
                    if (dist < r12) {
                        // Shot by an enemy!
                        ee.fireOn = false;
                        ee.s.attr("opacity", 0);
                        for (var e2 = 0; e2 < enemies.length; e2++) {
                            if (enemies[e2].isHit) {
                                // Light up a shot enemy
                                enemies[e2].isHit = false;
                                arrData[e2].isHit = false;
                                player.score -= 100;
                                if (player.score < 0) {
                                    player.score = 0;
                                    speed--;
                                    if (speed < 1) {
                                        speed = 1;
                                    }
                                }
                                break;
                            }
                        }
                    }
                }
            }
        }

        private checkForCollision(thisRef: ShootEmUpChart) {
            if (thisRef == null)
                return;

            var arrData = thisRef.arrData;
            var player = thisRef.player;
            var enemies = thisRef.enemies;
            var points = thisRef.points;

            for (var e = 0; e < arrData.length; e++) {
                var curE = arrData[e];
                for (var s = 0; s < player.shots.length; s++) {
                    var curS = player.shots[s];
                    var x1 = curS.x, y1 = curS.y, r1 = 5;
                    var x2 = curE.x, y2 = curE.y, r2 = curE.radius;
                    var r12 = (r1 + r2);
                    var dist = Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
                    if (dist < r12) {
                        // Shot hit!
                        if (!curE.isHit) {
                            var p:any = {};
                            p.category = curE.category;
                            p.value = curE.value;
                            p.x = curE.x;
                            p.y = curE.y;
                            p.velY = 5;
                            p.formattedValue = curE.formattedValue;
                            points.push(p);
                            player.score += 100;
                            if (player.score > 100000)
                                player.score = 0;
                        }

                        curE.isHit = true;
                        enemies[e].isHit = true;
                        curS.s.remove();
                        player.shots.splice(s, 1);
                        s++;
                        // Check if we got'em all
                        var gotAll = true;
                        for (var ee1 = 0; ee1 < enemies.length; ee1++) {
                            if (!enemies[ee1].isHit) {
                                gotAll = false;
                            }
                        }
                        if (gotAll && !player.gotAll) {
                            player.gotAll = true;
                            player.gotAllTimer = 0;
                            player.sCongrats.attr("opacity", 1);
                        }

                    }
                }
            }
        }        

        public update(options: VisualUpdateOptions) {
            if (!options.dataViews && !options.dataViews[0]) return;
            
            this.dataView = options.dataViews[0];
            
            this.sW = options.viewport.width;
            this.sH = options.viewport.height;

            this.scale = Math.sqrt(this.sW * this.sW + this.sH * this.sH) / 450;
            this.area = { width: this.sW, height: this.sH * 0.35 };

            this.arrData = this.converter();

            this.svg.attr({
                'height': this.sH,
                'width': this.sW
            }); 
            
            this.createEnemies();
            this.createPlayer();

            this.force = d3.layout.force()
                    .gravity(0.0)
                    .charge(function (d, i) { return 0; })
                    .nodes(this.arrData)
                    .size([this.sW, this.sH]);
            this.force.start();   
        }

        private createEnemies () {         // Denna körs bara när vi får ny data, ej vid varje tick
            if (this.enemies != null) {
                // Enemies are already created, remove them before continuing
                for (var i = 0; i < this.enemies.length; i++) {
                    this.enemies[i].s.remove();
                }
                this.enemyS.remove();
            }
            
            this.enemies = [];
            for (var i = 0; i < this.arrData.length; i++) {
                var d = this.arrData[i];
                var e: any = {};
                e.fireY = 0;
                e.fireOn = false;
                e.s = this.svg.append("circle").classed("enemyfire", true).attr({ cx: 10, cy: 10, r: 3, fill: "black", opacity: 0 });
                e.isHit = false;
                this.enemies.push(e);
            }

            // 2. Scale values to sizes
            var minValue = d3.min(this.arrData, function (d) { return d.value; });
            var maxValue = d3.max(this.arrData, function (d) { return d.value; });
            var minRef = 0;
            if (minValue < 0)
                minRef = minValue;
            var minmaxDist = maxValue - minValue;
            if (minmaxDist < 1)
                minmaxDist = 1;
            for (var i = 0; i < this.arrData.length; i++) {
                var d = this.arrData[i];
                var vNew = d.value;
                vNew -= minRef;
                vNew = vNew / minmaxDist;
                d.radius = (50 * this.scale * vNew / (this.arrData.length * 0.2)) + 5 * this.scale;
                if (d.radius > 50)
                    d.radius = 50;
            }

            // 3. Create svg
            var s = this.svg.append("g").selectAll(".enemies").data(this.arrData);
            s.enter().append("circle")
                .classed("enemies", true)
                .attr("r", function (d) { return d.radius; })
            ;          
            
            this.enemyS = s;
        }
        
        private createPlayer () {
            if (this.player != null) {
                // Player already created...
                this.player.sScore.remove();
                this.player.sCongrats.remove();
                this.player.s.remove();
                for (var i=0; i<this.player.shots.length; i++) {
                    this.player.shots[i].s.remove();
                }
            }
            this.player = {};
            this.player.x = this.sW * 0.5;
            this.player.y = this.sH * 1.00;
            this.player.velx = 0;
            this.player.radius = 30 * this.scale;
            this.player.score = 0;
            this.player.gotAll = false;
            this.player.s = this.svg.append("g").append("circle")
                        .classed("player", true)
                        .attr("r", this.player.radius)
                        .attr("cx", this.player.x)
                        .attr("cy", this.player.y)
                        .attr("fill", "gray")
            ;
            this.player.sScore = this.svg.append("g").append("text")
                .classed("score", true)
                .attr("font-family", "Calibri")
                .attr("font-size", "16px")
                .attr("color", "red")
                .attr("x", this.sW * 0.05)
                .attr("y", this.sH * 0.05)
                .attr("unselectable", "on")
            ;

            this.player.sCongrats = this.svg.append("g").append("text")
                .classed("congrats", true)
                .attr("text-anchor", "middle")
                .attr("font-family", "Calibri")
                .attr("font-size", 26 * this.scale + "px")
                .attr("background-color", "gray")
                .attr("x", this.sW * 0.5)
                .attr("y", this.sH * 0.5)
                .text("Good job, you got'em all!")
                .attr("opacity", 0)
                .attr("unselectable", "on")
            ;

            var e = this.player;
            e.mouse = {};

            this.player.shots = [];

            var thisRef = this;

            this.svg.on("click", function () {
                if (thisRef.player.shots.length > 5)
                    return;
                var a:any = {};
                a.x = thisRef.player.x;
                a.y = thisRef.player.y;
                a.velx = thisRef.player.velx * 0.1;
                a.vely = 3 * thisRef.scale;
                a.s = thisRef.svg.append("circle")
                    .attr("cx", a.x)
                    .attr("cy", a.y)
                    .attr("r", 5)
                    .attr("fill", "#223344");
                thisRef.player.shots.push(a);
            });

            this.svg.on("mousemove", function () { thisRef.player.mouse = d3.mouse(this); });

        }        
        
        private resetToNewLevel(thisRef: ShootEmUpChart) {
            if (thisRef == null)
                return;

            var enemies = thisRef.enemies;
            var arrData = thisRef.arrData;

            for (var e = 0; e < enemies.length; e++) {
                enemies[e].isHit = false;
                arrData[e].isHit = false;
                enemies[e].fireX = 0;
                enemies[e].fireY = 0;
                enemies[e].fireOn = false;
            }
        }

        public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstance[] {
            var instances: VisualObjectInstance[] = [];
            //var dataView = this.dataView;
            /*switch (options.objectName) {
               
            }*/
            return instances;
        }

        public destroy(): void {
            this.svg = null;
        }
    }
}

module powerbi.visuals.plugins {
	export var _ShootEmUpChart: IVisualPlugin = {
		name: '_ShootEmUpChart',
		class: '_ShootEmUpChart',
		capabilities: ShootEmUpChart.capabilities,
		create: () => new ShootEmUpChart()
	};
}
