using Xunit;
using FluentAssertions;
using BinMaps.Infrastructure.Services;

namespace BinMaps.Tests.Unit.Services
{
    public class DijkstraTSPTests
    {
        [Fact]
        public void Graph_AddNode_AddsSuccessfully()
        {
            var graph = new TruckRouteService.Graph();
            var node = new TruckRouteService.GraphNode { Id = 1, LocationX = 42.7, LocationY = 23.3 };

            graph.AddNode(node);

            graph.GetNodes().Should().Contain(node);
            graph.GetNodes().Count.Should().Be(1);
        }

        [Fact]
        public void Graph_AddEdge_CreatesConnection()
        {
            var graph = new TruckRouteService.Graph();
            var node1 = new TruckRouteService.GraphNode { Id = 1, LocationX = 42.7, LocationY = 23.3 };
            var node2 = new TruckRouteService.GraphNode { Id = 2, LocationX = 42.71, LocationY = 23.31 };
            graph.AddNode(node1);
            graph.AddNode(node2);

            graph.AddEdge(1, 2, 1.5);

            var fromNode = graph.GetNode(1);
            fromNode.Should().NotBeNull();
            fromNode!.Edges.Should().HaveCount(1);
            fromNode.Edges[0].TargetId.Should().Be(2);
            fromNode.Edges[0].Weight.Should().Be(1.5);
        }

        [Fact]
        public void Graph_GetNode_ReturnsCorrectNode()
        {
            var graph = new TruckRouteService.Graph();
            var node1 = new TruckRouteService.GraphNode { Id = 1, LocationX = 42.7, LocationY = 23.3 };
            var node2 = new TruckRouteService.GraphNode { Id = 2, LocationX = 42.71, LocationY = 23.31 };
            graph.AddNode(node1);
            graph.AddNode(node2);

            var retrieved = graph.GetNode(2);

            retrieved.Should().NotBeNull();
            retrieved!.Id.Should().Be(2);
            retrieved.LocationX.Should().Be(42.71);
        }

        [Fact]
        public void Graph_GetNode_NonExistent_ReturnsNull()
        {
            var graph = new TruckRouteService.Graph();

            var node = graph.GetNode(999);

            node.Should().BeNull();
        }

        [Fact]
        public void Graph_MultipleEdges_AllStored()
        {
            var graph = new TruckRouteService.Graph();
            var node1 = new TruckRouteService.GraphNode { Id = 1, LocationX = 42.7, LocationY = 23.3 };
            var node2 = new TruckRouteService.GraphNode { Id = 2, LocationX = 42.71, LocationY = 23.31 };
            var node3 = new TruckRouteService.GraphNode { Id = 3, LocationX = 42.72, LocationY = 23.32 };
            graph.AddNode(node1);
            graph.AddNode(node2);
            graph.AddNode(node3);

            graph.AddEdge(1, 2, 1.0);
            graph.AddEdge(1, 3, 2.0);
            graph.AddEdge(2, 3, 1.5);

            graph.GetNode(1)!.Edges.Should().HaveCount(2);
            graph.GetNode(2)!.Edges.Should().HaveCount(1);
            graph.GetNode(3)!.Edges.Should().BeEmpty();
        }

        [Fact]
        public void GraphNode_TruckNode_CorrectlyIdentified()
        {
            var truckNode = new TruckRouteService.GraphNode
            {
                Id = -1,
                LocationX = 42.7,
                LocationY = 23.3,
                IsTruck = true
            };

            truckNode.IsTruck.Should().BeTrue();
        }

        [Fact]
        public void GraphEdge_StoresWeightCorrectly()
        {
            var edge = new TruckRouteService.GraphEdge
            {
                TargetId = 2,
                Weight = 3.14
            };

            edge.TargetId.Should().Be(2);
            edge.Weight.Should().Be(3.14);
        }

        [Fact]
        public void Graph_SelfLoop_NotAdded()
        {
            var graph = new TruckRouteService.Graph();
            var node = new TruckRouteService.GraphNode { Id = 1, LocationX = 42.7, LocationY = 23.3 };
            graph.AddNode(node);

            graph.AddEdge(1, 1, 0);

            graph.GetNode(1)!.Edges.Should().BeEmpty();
        }

        [Fact]
        public void Graph_Dijkstra_ShortestPath()
        {
            var graph = new TruckRouteService.Graph();
            graph.AddNode(new TruckRouteService.GraphNode { Id = 1, LocationX = 0, LocationY = 0 });
            graph.AddNode(new TruckRouteService.GraphNode { Id = 2, LocationX = 1, LocationY = 0 });
            graph.AddNode(new TruckRouteService.GraphNode { Id = 3, LocationX = 2, LocationY = 0 });

            graph.AddEdge(1, 2, 1.0);
            graph.AddEdge(2, 3, 1.0);
            graph.AddEdge(1, 3, 5.0);

            var distances = graph.Dijkstra(1);

            distances[1].Should().Be(0);
            distances[2].Should().Be(1.0);
            distances[3].Should().Be(2.0); 
        }

        [Fact]
        public void Graph_ComplexScenario_FullGraph()
        {
            var graph = new TruckRouteService.Graph();

            graph.AddNode(new TruckRouteService.GraphNode { Id = -1, LocationX = 42.7, LocationY = 23.3, IsTruck = true });

            for (int i = 1; i <= 3; i++)
            {
                graph.AddNode(new TruckRouteService.GraphNode
                {
                    Id = i,
                    LocationX = 42.7 + (i * 0.01),
                    LocationY = 23.3 + (i * 0.01)
                });
            }

            foreach (var from in graph.GetNodes())
            {
                foreach (var to in graph.GetNodes())
                {
                    if (from.Id != to.Id)
                    {
                        double dist = Math.Sqrt(
                            Math.Pow(to.LocationX - from.LocationX, 2) +
                            Math.Pow(to.LocationY - from.LocationY, 2));
                        graph.AddEdge(from.Id, to.Id, dist);
                    }
                }
            }

            graph.GetNodes().Should().HaveCount(4);
            graph.GetNode(-1)!.Edges.Should().HaveCount(3);
            graph.GetNode(1)!.Edges.Should().HaveCount(3);
        }
    }
}
