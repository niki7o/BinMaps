import { Component, AfterViewInit, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ChartData, ChartConfiguration } from 'chart.js';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import { Map, tileLayer, markerClusterGroup } from 'leaflet';

interface Bin {
  id: number;
  fillPercentage: number;
  [key: string]: any;
}

type TLabel = string | string[];

@Component({
  selector: 'app-analytics-dashboard',
  standalone: true,
  imports: [CommonModule, BaseChartDirective],
   providers: [CurrencyPipe],
  templateUrl: './analytics-dashboard.component.html',
  styleUrls: ['./analytics-dashboard.component.css']
})
export class AnalyticsDashboardComponent implements AfterViewInit, OnInit {
  private http = inject(HttpClient);
  private currencyPipe = inject(CurrencyPipe);

  currentUser: any = null;
  private map!: Map;
  private cluster = markerClusterGroup();
  private allBins: Bin[] = [];
  private selectedBinForReport: Bin | null = null;

  stats = {
    totalBins: 0,
    efficiency: 0,
    savedMoney: 0
  };

  pieChartData: ChartData<'pie', number[], TLabel> = {
    labels: [],
    datasets: [{ data: [], backgroundColor: [] }]
  };
  pieChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    plugins: { legend: { position: 'top' } }
  };

  efficiencyChartData: ChartData<'doughnut', number[], TLabel> = {
    labels: ['Efficient', 'Inefficient'],
    datasets: [{ data: [], backgroundColor: ['#00ff88', '#444'] }]
  };
  efficiencyChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    plugins: { legend: { position: 'top' } }
  };

  barChartData: ChartData<'bar', number[], TLabel> = {
    labels: [],
    datasets: [{ data: [], backgroundColor: '#ff3300', label: 'Fill %' }]
  };
  barChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    scales: { y: { beginAtZero: true, max: 100 } },
    plugins: { legend: { display: false } }
  };

  ngOnInit() {
    this.loadBins();
  }

  ngAfterViewInit() {
    this.map = new Map('map', {
      center: [42.6977, 23.3219],
      zoom: 12,
      minZoom: 10,
      maxBounds: [[42.3, 23], [43, 23.7]]
    });

    tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(this.map);
    this.map.addLayer(this.cluster);
  }

  loadBins() {
    this.http.get<Bin[]>('https://localhost:7277/api/containers').subscribe((bins: Bin[]) => {
      this.allBins = bins;
      this.stats.totalBins = bins.length;

      const avgFill = bins.reduce((sum, b) => sum + b.fillPercentage, 0) / bins.length;
      this.stats.efficiency = Math.round(avgFill);
      this.stats.savedMoney = Math.round(bins.length * avgFill * 0.3);

      const low = bins.filter(b => b.fillPercentage < 40).length;
      const med = bins.filter(b => b.fillPercentage >= 40 && b.fillPercentage <= 70).length;
      const high = bins.filter(b => b.fillPercentage > 70).length;

      this.pieChartData = {
        labels: ['Low', 'Medium', 'High'],
        datasets: [
          {
            data: [low, med, high],
            backgroundColor: ['#00ff88', '#ffcc00', '#ff3300']
          }
        ]
      };

      this.efficiencyChartData = {
        labels: ['Efficient', 'Inefficient'],
        datasets: [
          {
            data: [this.stats.efficiency, 100 - this.stats.efficiency],
            backgroundColor: ['#00ff88', '#444']
          }
        ]
      };

      const top5 = [...bins].sort((a, b) => b.fillPercentage - a.fillPercentage).slice(0, 5);
      this.barChartData = {
        labels: top5.map(b => `BIN-${b.id}`),
        datasets: [
          {
            data: top5.map(b => b.fillPercentage),
            backgroundColor: '#ff3300',
            label: 'Fill %'
          }
        ]
      };
    });
  }

  submitReport() {
    if (!this.selectedBinForReport) {
      alert('Изберете кофа!');
      return;
    }
    alert(`Репорт за кофа #${this.selectedBinForReport.id} е изпратен.`);
  }

  logout() {
    localStorage.removeItem('user');
    location.reload();
  }
}
