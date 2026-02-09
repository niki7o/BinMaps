import { Component, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ChartData, ChartConfiguration } from 'chart.js';
import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';

interface Bin {
  id: number;
  fillPercentage: number;
}

type TLabel = string | string[];

@Component({
  selector: 'app-analytics-dashboard',
  standalone: true,
  imports: [CommonModule, BaseChartDirective],
  templateUrl: './analytics-dashboard.component.html',
  styleUrls: ['./analytics-dashboard.component.css']
})
export class AnalyticsDashboardComponent implements OnInit {

  private http = inject(HttpClient);

 stats = {
  totalBins: 0,
  efficiency: 0,
  savedMoney: 0,
  highLoad: 0,
  lowLoad: 0,
  peakPrediction: ''
};
  pieChartData: ChartData<'pie', number[], TLabel> = {
    labels: [],
    datasets: [{ data: [], backgroundColor: [] }]
  };

  efficiencyChartData: ChartData<'doughnut', number[], TLabel> = {
    labels: ['Efficient', 'Inefficient'],
    datasets: [{ data: [], backgroundColor: ['#00ff88', '#444'] }]
  };

  barChartData: ChartData<'bar', number[], TLabel> = {
    labels: [],
    datasets: [{ data: [], backgroundColor: '#ff3300', label: 'Fill %' }]
  };

  ngOnInit() {
    this.loadBins();
  }

  loadBins() {
    this.http.get<Bin[]>('https://localhost:7277/api/containers')
      .subscribe(bins => {

        this.stats.totalBins = bins.length;

        const avgFill = bins.reduce((s, b) => s + b.fillPercentage, 0) / bins.length;
        this.stats.efficiency = Math.round(avgFill);
        this.stats.savedMoney = Math.round(bins.length * avgFill * 0.3);

        // Pie
        const low = bins.filter(b => b.fillPercentage < 40).length;
        const med = bins.filter(b => b.fillPercentage <= 70 && b.fillPercentage >= 40).length;
        const high = bins.filter(b => b.fillPercentage > 70).length;

        this.pieChartData = {
          labels: ['Low', 'Medium', 'High'],
          datasets: [{
            data: [low, med, high],
            backgroundColor: ['#00ff88', '#ffcc00', '#ff3300']
          }]
        };

        // Efficiency
        this.efficiencyChartData.datasets[0].data =
          [this.stats.efficiency, 100 - this.stats.efficiency];
          
this.stats.highLoad = bins.filter(b => b.fillPercentage > 80).length;

this.stats.lowLoad = bins.filter(b => b.fillPercentage < 30).length;

this.stats.peakPrediction =
  this.stats.efficiency > 70 ? 'Следващите 24 часа' : 'Нормално натоварване';

        // Top 5
        const top5 = [...bins]
          .sort((a, b) => b.fillPercentage - a.fillPercentage)
          .slice(0, 5);

        this.barChartData = {
          labels: top5.map(b => `BIN-${b.id}`),
          datasets: [{
            data: top5.map(b => b.fillPercentage),
            backgroundColor: '#ff3300',
            label: 'Fill %'
          }]
        };
      });
  }
}
